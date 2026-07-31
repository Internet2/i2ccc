from aws_cdk import (
    BundlingOptions,
    CfnOutput,
    Duration,
    RemovalPolicy,
    Stack,
    TimeZone,
)
from aws_cdk import (
    aws_dynamodb as dynamodb,
)
from aws_cdk import (
    aws_iam as iam,
)
from aws_cdk import (
    aws_lambda as lambda_,
)
from aws_cdk import (
    aws_s3 as s3,
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

WATERMARK_PARAM = "/abe/conversation-export/last-exported-timestamp"


class ConversationExport(Construct):
    """
    Weekly Excel export of the conversation-history table, emailed as a
    presigned download link:

      EventBridge Scheduler (Mondays 8am ET) -> export lambda:
        1. read the watermark from SSM (unset -> export the whole history)
        2. scan the conversation table, build an .xlsx keeping every attribute
        3. upload to the exports bucket, email a presigned link over SNS
        4. advance the watermark

    Aimed at non-engineers: the reader filters the workbook in Excel instead of
    querying DynamoDB. The email also carries plain console links to the file,
    which keep working after the presigned link expires - those need the reader
    to be signed in to AWS with read access to the export bucket.

    The watermark lives outside CDK on purpose - a StringParameter with a value
    would reset the export window on every deploy.
    """

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        conversation_table: dynamodb.ITable,
        export_email=None,
        url_expiry_days: int = 7,
        retain_exports_days: int = None,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        #################################################################################
        # EXPORT BUCKET
        #################################################################################
        # Separate from the content buckets: these files hold what people asked
        # ABE, so they expire on their own schedule and are never public.
        #
        # RETAIN, unlike the rest of the stack: the exports are the historical
        # record product staff work from, and old emails link into this bucket,
        # so a cdk destroy must not take them with it. The bucket is left
        # behind and has to be emptied and deleted by hand if it is ever really
        # unwanted. auto_delete_objects is therefore off - CDK rejects it
        # without a DESTROY policy.
        export_bucket = s3.Bucket(
            self,
            "ExportBucket",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            encryption=s3.BucketEncryption.S3_MANAGED,
            enforce_ssl=True,
            removal_policy=RemovalPolicy.RETAIN,
            # Exports are kept indefinitely unless config.yaml asks for an
            # expiry, so the console links in old emails keep working
            lifecycle_rules=(
                [
                    s3.LifecycleRule(
                        id="expire-old-exports",
                        prefix="conversation-exports/",
                        expiration=Duration.days(retain_exports_days),
                    )
                ]
                if retain_exports_days
                else []
            ),
        )

        #################################################################################
        # NOTIFICATION TOPIC
        #################################################################################
        topic = sns.Topic(
            self,
            "ConversationExportTopic",
            display_name="ABE weekly conversation export",
        )
        # config.yaml may give one address or a list of them. Each subscription
        # has to be confirmed individually from its own inbox.
        if isinstance(export_email, str):
            export_email = [export_email]
        for address in dict.fromkeys(export_email or []):
            topic.add_subscription(subscriptions.EmailSubscription(address))

        #################################################################################
        # EXPORT LAMBDA
        #################################################################################
        export_lambda = lambda_.Function(
            self,
            "ExportLambda",
            # Fixed name so the log group is predictable and scripts/ can invoke
            # it without looking up a generated name
            function_name="abe-conversation-export",
            runtime=lambda_.Runtime.PYTHON_3_13,
            handler="export.handler",
            code=lambda_.Code.from_asset(
                "src/conversation_export",
                bundling=BundlingOptions(
                    image=lambda_.Runtime.PYTHON_3_13.bundling_image,
                    command=[
                        "bash",
                        "-c",
                        "pip install --platform manylinux2014_x86_64 --implementation cp --python-version 3.13 --only-binary=:all: --target /asset-output -r requirements.txt && cp -au . /asset-output",
                    ],
                ),
            ),
            # The whole table is held in memory while the workbook is built;
            # generous headroom is cheaper than a failed weekly email.
            memory_size=2048,
            timeout=Duration.minutes(5),
            environment={
                "CONVERSATION_TABLE": conversation_table.table_name,
                "EXPORT_BUCKET": export_bucket.bucket_name,
                "EXPORT_PREFIX": "conversation-exports",
                "SNS_TOPIC_ARN": topic.topic_arn,
                "WATERMARK_PARAM": WATERMARK_PARAM,
                "URL_EXPIRY_DAYS": str(url_expiry_days),
                # 0 tells the email to say the files are kept indefinitely
                "EXPORT_RETENTION_DAYS": str(retain_exports_days or 0),
                "REPORT_TIMEZONE": "America/New_York",
            },
        )

        conversation_table.grant_read_data(export_lambda)
        export_bucket.grant_put(export_lambda, "conversation-exports/*")
        # A presigned URL carries the signer's permissions, so the function
        # needs read on the object for the emailed link to work at all
        export_bucket.grant_read(export_lambda, "conversation-exports/*")
        topic.grant_publish(export_lambda)
        export_lambda.add_to_role_policy(
            iam.PolicyStatement(
                actions=["ssm:GetParameter", "ssm:PutParameter"],
                resources=[
                    f"arn:aws:ssm:{Stack.of(self).region}:"
                    f"{Stack.of(self).account}:parameter{WATERMARK_PARAM}"
                ],
            )
        )

        #################################################################################
        # WEEKLY SCHEDULE
        #################################################################################
        # EventBridge Scheduler is timezone-aware, so 8am Eastern stays 8am
        # Eastern across DST transitions.
        scheduler.Schedule(
            self,
            "WeeklyExportSchedule",
            schedule=scheduler.ScheduleExpression.cron(
                minute="0",
                hour="8",
                week_day="MON",
                time_zone=TimeZone.AMERICA_NEW_YORK,
            ),
            target=scheduler_targets.LambdaInvoke(
                export_lambda, input=scheduler.ScheduleTargetInput.from_object({})
            ),
            description="Weekly ABE conversation export (Mondays 8am ET)",
        )

        CfnOutput(
            self,
            "ConversationExportFunctionName",
            value=export_lambda.function_name,
            description="Invoke with an empty payload to export now instead of waiting for Monday",
        )
        CfnOutput(
            self,
            "ConversationExportBucket",
            value=export_bucket.bucket_name,
            description="Where weekly conversation exports are stored",
        )
        CfnOutput(
            self,
            "ConversationExportTopicArn",
            value=topic.topic_arn,
            description="SNS topic for the weekly export email (subscription must be confirmed)",
        )
