from aws_cdk import (
    CfnOutput,
    Duration,
    Stack,
    TimeZone,
)
from aws_cdk import (
    aws_iam as iam,
)
from aws_cdk import (
    aws_lambda as lambda_,
)
from aws_cdk import (
    aws_scheduler as scheduler,
)
from aws_cdk import (
    aws_scheduler_targets as scheduler_targets,
)
from aws_cdk import (
    aws_sns as sns,
)
from aws_cdk import (
    aws_sns_subscriptions as subscriptions,
)
from constructs import Construct

STATUS_PARAM = "/abe/model-lifecycle/last-status"


class ModelLifecycleMonitor(Construct):
    """
    Weekly check of Bedrock modelLifecycle.status for every model configured
    in config.yaml, emailing an alert only when a status actually changes
    (ACTIVE -> LEGACY, etc.) - AWS Health's DescribeEvents needs a
    Business/Enterprise support plan we don't have, so this is a
    support-plan-independent way to learn about deprecations. See
    BEDROCK_MODEL_LIFECYCLE_MONITOR.md for the full design.
    """

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        chat_model: str,
        embedding_model: str,
        video_text_model_id: str,
        classifier_model: str,
        document_filter_model: str,
        notification_email: str | list[str] = None,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        #################################################################################
        # NOTIFICATION TOPIC
        #################################################################################
        topic = sns.Topic(
            self,
            "ModelLifecycleTopic",
            display_name="ABE model lifecycle alerts",
        )
        # config.yaml may give one address or a list of them. Each subscription
        # has to be confirmed individually from its own inbox.
        if isinstance(notification_email, str):
            notification_email = [notification_email]
        for address in dict.fromkeys(notification_email or []):
            topic.add_subscription(subscriptions.EmailSubscription(address))

        #################################################################################
        # MONITOR LAMBDA
        #################################################################################
        monitor_lambda = lambda_.Function(
            self,
            "MonitorLambda",
            function_name="abe-model-lifecycle-monitor",
            runtime=lambda_.Runtime.PYTHON_3_13,
            handler="monitor.handler",
            code=lambda_.Code.from_asset("src/model_lifecycle"),
            timeout=Duration.seconds(30),
            environment={
                "CHAT_MODEL_ID": chat_model,
                "EMBEDDING_MODEL_ID": embedding_model,
                "VIDEO_TEXT_MODEL_ID": video_text_model_id,
                "CLASSIFIER_MODEL_ID": classifier_model,
                "DOCUMENT_FILTER_MODEL_ID": document_filter_model,
                "SNS_TOPIC_ARN": topic.topic_arn,
                "STATUS_PARAM": STATUS_PARAM,
            },
        )
        topic.grant_publish(monitor_lambda)
        monitor_lambda.add_to_role_policy(
            iam.PolicyStatement(
                actions=["bedrock:GetFoundationModel", "bedrock:GetInferenceProfile"],
                resources=[
                    "arn:aws:bedrock:*::foundation-model/*",
                    f"arn:aws:bedrock:*:{Stack.of(self).account}:inference-profile/*",
                ],
            )
        )
        monitor_lambda.add_to_role_policy(
            iam.PolicyStatement(
                actions=["ssm:GetParameter", "ssm:PutParameter"],
                resources=[
                    f"arn:aws:ssm:{Stack.of(self).region}:"
                    f"{Stack.of(self).account}:parameter{STATUS_PARAM}"
                ],
            )
        )

        #################################################################################
        # WEEKLY SCHEDULE
        #################################################################################
        # EventBridge Scheduler is timezone-aware, so 8am Eastern stays 8am
        # Eastern across DST transitions. Legacy lead time is a minimum of 6
        # months, so weekly (not daily) is plenty.
        scheduler.Schedule(
            self,
            "WeeklyModelLifecycleSchedule",
            schedule=scheduler.ScheduleExpression.cron(
                minute="0",
                hour="8",
                week_day="MON",
                time_zone=TimeZone.AMERICA_NEW_YORK,
            ),
            target=scheduler_targets.LambdaInvoke(
                monitor_lambda, input=scheduler.ScheduleTargetInput.from_object({})
            ),
            description="Weekly Bedrock model lifecycle check (Mondays 8am ET)",
        )

        CfnOutput(
            self,
            "ModelLifecycleFunctionName",
            value=monitor_lambda.function_name,
            description="Invoke with an empty payload to check now instead of waiting for Monday",
        )
        CfnOutput(
            self,
            "ModelLifecycleTopicArn",
            value=topic.topic_arn,
            description="SNS topic for model lifecycle alerts (subscription must be confirmed)",
        )
