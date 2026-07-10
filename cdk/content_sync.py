from aws_cdk import (
    CfnOutput,
    Duration,
    RemovalPolicy,
)
from aws_cdk import (
    aws_ec2 as ec2,
)
from aws_cdk import (
    aws_ecr_assets as ecr_assets,
)
from aws_cdk import (
    aws_ecs as ecs,
)
from aws_cdk import (
    aws_iam as iam,
)
from aws_cdk import (
    aws_lambda as lambda_,
)
from aws_cdk import (
    aws_logs as logs,
)
from aws_cdk import (
    aws_s3 as s3,
)
from aws_cdk import (
    aws_secretsmanager as secretsmanager,
)
from aws_cdk import (
    aws_sns as sns,
)
from aws_cdk import (
    aws_sns_subscriptions as subscriptions,
)
from aws_cdk import (
    aws_stepfunctions as sfn,
)
from aws_cdk import (
    aws_stepfunctions_tasks as tasks,
)
from constructs import Construct


class ContentSync(Construct):
    """
    One-command content-sync pipeline:

      kickoff lambda -> Step Functions:
        1. collector Fargate task (confluence scrape + drive download -> S3)
        2. existing DataIngestionStateMachine (process the new files)
        3. notify lambda -> SNS email (success or failure, with log links)
    """

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        cluster: ecs.Cluster,
        vpc: ec2.Vpc,
        input_assets_bucket: s3.Bucket,
        ingestion_state_machine: sfn.StateMachine,
        notification_email: str = None,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        #################################################################################
        # SECRETS (values are set once after deploy, never stored in code)
        #################################################################################
        confluence_secret = secretsmanager.Secret(
            self,
            "ConfluenceApiToken",
            secret_name="content-sync/confluence-api-token",
            description="Confluence API token for the content-sync collector",
        )
        google_secret = secretsmanager.Secret(
            self,
            "GoogleServiceAccountJson",
            secret_name="content-sync/google-service-credentials",
            description="Google service account JSON for the content-sync collector",
        )
        # Optional: only used as the Drive API developerKey. The collector
        # ignores values that don't look like a real key (AIza...), so this
        # can safely stay unset.
        google_api_key_secret = secretsmanager.Secret(
            self,
            "GoogleApiKey",
            secret_name="content-sync/google-api-key",
            description="Optional Google API key for the content-sync collector",
        )

        #################################################################################
        # COLLECTOR FARGATE TASK
        #################################################################################
        collector_log_group = logs.LogGroup(
            self,
            "CollectorLogGroup",
            log_group_name="/ecs/content-sync-collector",
            removal_policy=RemovalPolicy.DESTROY,
            retention=logs.RetentionDays.ONE_MONTH,
        )

        execution_role = iam.Role(
            self,
            "CollectorExecutionRole",
            assumed_by=iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name(
                    "service-role/AmazonECSTaskExecutionRolePolicy"
                )
            ],
        )
        # Secret injection into the container happens via the execution role
        confluence_secret.grant_read(execution_role)
        google_secret.grant_read(execution_role)
        google_api_key_secret.grant_read(execution_role)

        task_role = iam.Role(
            self,
            "CollectorTaskRole",
            assumed_by=iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
        )
        task_role.add_to_policy(
            iam.PolicyStatement(
                actions=["s3:ListBucket"],
                resources=[input_assets_bucket.bucket_arn],
            )
        )
        task_role.add_to_policy(
            iam.PolicyStatement(
                actions=["s3:PutObject", "s3:GetObject"],
                resources=[f"{input_assets_bucket.bucket_arn}/*"],
            )
        )

        task_definition = ecs.FargateTaskDefinition(
            self,
            "CollectorTaskDef",
            cpu=2048,
            memory_limit_mib=8192,
            ephemeral_storage_gib=100,
            execution_role=execution_role,
            task_role=task_role,
        )

        collector_container = task_definition.add_container(
            "collector",
            image=ecs.ContainerImage.from_asset(
                directory=".",
                file="ingest_utils/confluence_processor/Dockerfile",
                asset_name="content-sync-collector",
                platform=ecr_assets.Platform.LINUX_AMD64,
            ),
            logging=ecs.LogDriver.aws_logs(
                stream_prefix="collector",
                log_group=collector_log_group,
            ),
            secrets={
                "CONFLUENCE_API": ecs.Secret.from_secrets_manager(confluence_secret),
                "GOOGLE_SERVICE_ACCOUNT_JSON": ecs.Secret.from_secrets_manager(
                    google_secret
                ),
                "GOOGLE_API_KEY": ecs.Secret.from_secrets_manager(
                    google_api_key_secret
                ),
            },
        )

        security_group = ec2.SecurityGroup(
            self,
            "CollectorSecurityGroup",
            vpc=vpc,
            description="Security group for the content-sync collector task",
            allow_all_outbound=True,
        )

        #################################################################################
        # NOTIFICATION (SNS + notify lambda)
        #################################################################################
        topic = sns.Topic(
            self,
            "ContentSyncTopic",
            display_name="Content sync run notifications",
        )
        if notification_email:
            topic.add_subscription(
                subscriptions.EmailSubscription(notification_email)
            )

        notify_lambda = lambda_.Function(
            self,
            "NotifyLambda",
            runtime=lambda_.Runtime.PYTHON_3_13,
            handler="notify.handler",
            code=lambda_.Code.from_asset("src/content_sync"),
            timeout=Duration.seconds(30),
            environment={
                "SNS_TOPIC_ARN": topic.topic_arn,
                "BUCKET": input_assets_bucket.bucket_name,
                "COLLECTOR_LOG_GROUP": collector_log_group.log_group_name,
            },
        )
        topic.grant_publish(notify_lambda)
        notify_lambda.add_to_role_policy(
            iam.PolicyStatement(
                actions=["s3:GetObject"],
                resources=[f"{input_assets_bucket.bucket_arn}/sync-runs/*"],
            )
        )
        # Without ListBucket, GetObject on a missing key returns AccessDenied
        # instead of NoSuchKey
        notify_lambda.add_to_role_policy(
            iam.PolicyStatement(
                actions=["s3:ListBucket"],
                resources=[input_assets_bucket.bucket_arn],
                conditions={"StringLike": {"s3:prefix": "sync-runs/*"}},
            )
        )

        #################################################################################
        # PIPELINE STATE MACHINE
        #################################################################################
        run_collector = tasks.EcsRunTask(
            self,
            "RunCollector",
            integration_pattern=sfn.IntegrationPattern.RUN_JOB,
            cluster=cluster,
            task_definition=task_definition,
            assign_public_ip=True,
            security_groups=[security_group],
            launch_target=tasks.EcsFargateLaunchTarget(
                platform_version=ecs.FargatePlatformVersion.LATEST,
            ),
            container_overrides=[
                tasks.ContainerOverride(
                    container_definition=collector_container,
                    environment=[
                        tasks.TaskEnvironmentVariable(
                            name="RUN_ID",
                            value=sfn.JsonPath.string_at("$$.Execution.Name"),
                        ),
                    ],
                )
            ],
            result_path="$.collector_result",
        )

        run_ingestion = tasks.StepFunctionsStartExecution(
            self,
            "RunIngestion",
            state_machine=ingestion_state_machine,
            integration_pattern=sfn.IntegrationPattern.RUN_JOB,
            input=sfn.TaskInput.from_object({}),
            result_path="$.ingestion_result",
        )

        notify_success = tasks.LambdaInvoke(
            self,
            "NotifySuccess",
            lambda_function=notify_lambda,
            payload=sfn.TaskInput.from_object(
                {
                    "status": "SUCCEEDED",
                    "run_id": sfn.JsonPath.string_at("$$.Execution.Name"),
                    "execution_arn": sfn.JsonPath.string_at("$$.Execution.Id"),
                }
            ),
            result_path=sfn.JsonPath.DISCARD,
        )

        def failure_branch(stage: str) -> sfn.Chain:
            notify = tasks.LambdaInvoke(
                self,
                f"NotifyFailed{stage.title().replace('_', '')}",
                lambda_function=notify_lambda,
                payload=sfn.TaskInput.from_object(
                    {
                        "status": "FAILED",
                        "failed_stage": stage,
                        "run_id": sfn.JsonPath.string_at("$$.Execution.Name"),
                        "execution_arn": sfn.JsonPath.string_at("$$.Execution.Id"),
                        "error": sfn.JsonPath.object_at("$.error"),
                    }
                ),
                result_path=sfn.JsonPath.DISCARD,
            )
            fail = sfn.Fail(
                self,
                f"Fail{stage.title().replace('_', '')}",
                cause=f"Content sync failed during the {stage} stage",
            )
            return notify.next(fail)

        run_collector.add_catch(
            failure_branch("collector"), result_path="$.error"
        )
        run_ingestion.add_catch(
            failure_branch("ingestion"), result_path="$.error"
        )

        pipeline = sfn.StateMachine(
            self,
            "ContentSyncPipeline",
            definition=run_collector.next(run_ingestion).next(notify_success),
            timeout=Duration.hours(12),
        )

        #################################################################################
        # KICKOFF LAMBDA (the one command)
        #################################################################################
        kickoff_lambda = lambda_.Function(
            self,
            "KickoffLambda",
            function_name="content-sync-kickoff",
            runtime=lambda_.Runtime.PYTHON_3_13,
            handler="kickoff.handler",
            code=lambda_.Code.from_asset("src/content_sync"),
            timeout=Duration.seconds(30),
            environment={
                "STATE_MACHINE_ARN": pipeline.state_machine_arn,
            },
        )
        pipeline.grant_start_execution(kickoff_lambda)
        pipeline.grant_read(kickoff_lambda)

        CfnOutput(
            self,
            "KickoffFunctionName",
            value=kickoff_lambda.function_name,
            description="Invoke this lambda to start a content-sync run",
        )
        CfnOutput(
            self,
            "ConfluenceSecretName",
            value=confluence_secret.secret_name,
            description="Set with: aws secretsmanager put-secret-value --secret-id <name> --secret-string <token>",
        )
        CfnOutput(
            self,
            "GoogleSecretName",
            value=google_secret.secret_name,
            description="Set with: aws secretsmanager put-secret-value --secret-id <name> --secret-string file://service-credentials.json",
        )
        CfnOutput(
            self,
            "GoogleApiKeySecretName",
            value=google_api_key_secret.secret_name,
            description="Optional Google API key; leave unset if unused",
        )
        CfnOutput(
            self,
            "ContentSyncTopicArn",
            value=topic.topic_arn,
            description="SNS topic for run notifications (email subscription must be confirmed)",
        )
