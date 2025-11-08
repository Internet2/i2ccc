import json

from aws_cdk import (
    BundlingOptions,
    CfnOutput,
    Duration,
    Fn,
    RemovalPolicy,
    Size,
    Stack,
)
from aws_cdk import (
    aws_dynamodb as dynamodb,
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
    aws_opensearchserverless as aws_opss,
)
from aws_cdk import (
    aws_s3 as s3,
)
from aws_cdk import (
    aws_stepfunctions as sfn,
)
from aws_cdk import (
    aws_stepfunctions_tasks as tasks,
)
from constructs import Construct


class RagIngest(Construct):
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        opensearch_index_name: str,
        opensearch_collection_name: str,
        embeddings_model_id: str,
        video_text_model_id: str,
        region: str,
        max_concurrency: int,
        step_function_timeout_hours: int,
        chunk_size: str,
        overlap: str,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        #################################################################################
        # CDK FOR THE OPENSEARCH VECTOR DATABASE
        #################################################################################
        collection_name = opensearch_collection_name

        network_security_policy = json.dumps(
            [
                {
                    "Rules": [
                        {
                            "Resource": [f"collection/{collection_name}"],
                            "ResourceType": "dashboard",
                        },
                        {
                            "Resource": [f"collection/{collection_name}"],
                            "ResourceType": "collection",
                        },
                    ],
                    "AllowFromPublic": True,
                }
            ],
            indent=2,
        )

        cfn_network_security_policy = aws_opss.CfnSecurityPolicy(
            self,
            "NetworkSecurityPolicy",
            policy=network_security_policy,
            name=f"{collection_name}-security-policy",
            type="network",
        )

        encryption_security_policy = json.dumps(
            {
                "Rules": [
                    {
                        "Resource": [f"collection/{collection_name}"],
                        "ResourceType": "collection",
                    }
                ],
                "AWSOwnedKey": True,
            },
            indent=2,
        )

        cfn_encryption_security_policy = aws_opss.CfnSecurityPolicy(
            self,
            "EncryptionSecurityPolicy",
            policy=encryption_security_policy,
            name=f"{collection_name}-security-policy",
            type="encryption",
        )

        cfn_collection = aws_opss.CfnCollection(
            self,
            collection_name,
            name=collection_name,
            description="Collection to be used for vector analysis using OpenSearch Serverless",
            type="VECTORSEARCH",  # [SEARCH, TIMESERIES]
        )
        cfn_collection.add_dependency(cfn_network_security_policy)
        cfn_collection.add_dependency(cfn_encryption_security_policy)

        data_access_policy = json.dumps(
            [
                {
                    "Rules": [
                        {
                            "Resource": [f"collection/{collection_name}"],
                            "Permission": [
                                "aoss:CreateCollectionItems",
                                "aoss:DeleteCollectionItems",
                                "aoss:UpdateCollectionItems",
                                "aoss:DescribeCollectionItems",
                            ],
                            "ResourceType": "collection",
                        },
                        {
                            "Resource": [f"index/{collection_name}/*"],
                            "Permission": [
                                "aoss:CreateIndex",
                                "aoss:DeleteIndex",
                                "aoss:UpdateIndex",
                                "aoss:DescribeIndex",
                                "aoss:ReadDocument",
                                "aoss:WriteDocument",
                            ],
                            "ResourceType": "index",
                        },
                    ],
                    "Principal": [
                        f"arn:aws:iam::{Stack.of(self).account}:root"  # Grant access to the AWS account
                    ],
                    "Description": "data-access-rule",
                }
            ],
            indent=2,
        )

        data_access_policy_name = f"{collection_name}-policy"
        assert len(data_access_policy_name) <= 32

        cfn_access_policy = aws_opss.CfnAccessPolicy(
            self,
            "OpssDataAccessPolicy",
            name=data_access_policy_name,
            description="Policy for data access",
            policy=data_access_policy,
            type="data",
        )

        # Removes https:// from Opensearch endpoint
        opensearch_endpoint = Fn.select(
            1, Fn.split("https://", cfn_collection.attr_collection_endpoint)
        )

        collection_arn = cfn_collection.attr_arn

        # Define custom inline policy
        opensearch_policy = iam.PolicyStatement(
            effect=iam.Effect.ALLOW,
            actions=[
                "aoss:APIAccessAll",
            ],
            resources=["*"],
        )

        # Create VPC (required for ECS Fargate)
        vpc = ec2.Vpc(
            self,
            "IngestVPC",
            max_azs=2,
            nat_gateways=0,
        )

        # Create S3 bucket
        input_assets_bucket = s3.Bucket(
            self,
            "InputAssetsBucket",
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
        )

        # Create DynamoDB table for processed files cache
        processed_files_table = dynamodb.Table(
            self,
            "ProcessedFilesTable",
            partition_key=dynamodb.Attribute(
                name="s3_uri", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,
        )

        # Add bucket policy for Transcribe access
        input_assets_bucket.add_to_resource_policy(
            iam.PolicyStatement(
                actions=["s3:*"],
                principals=[iam.ServicePrincipal("transcribe.amazonaws.com")],
                resources=[
                    input_assets_bucket.bucket_arn,
                    f"{input_assets_bucket.bucket_arn}/*",
                ],
            )
        )

        #################################################################################
        # ECS CLUSTER AND CONTAINER SETUP
        #################################################################################

        # Create ECS Cluster
        cluster = ecs.Cluster(
            self,
            "IngestCluster",
            vpc=vpc,
            enable_fargate_capacity_providers=True,
        )

        # Create IAM execution role for ECS tasks
        execution_role = iam.Role(
            self,
            "EcsTaskExecutionRole",
            assumed_by=iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name(
                    "service-role/AmazonECSTaskExecutionRolePolicy"
                )
            ],
        )

        # Create IAM task role with necessary permissions
        task_role = iam.Role(
            self,
            "EcsTaskRole",
            assumed_by=iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name(
                    "AmazonTextractFullAccess"
                ),
                iam.ManagedPolicy.from_aws_managed_policy_name(
                    "AmazonBedrockFullAccess"
                ),
            ],
        )

        # Grant S3 permissions to task role
        input_assets_bucket.grant_read_write(task_role)

        # Add Transcribe permissions
        transcribe_policy = iam.PolicyStatement(
            actions=[
                "transcribe:StartTranscriptionJob",
                "transcribe:GetTranscriptionJob",
                "transcribe:DeleteTranscriptionJob",
            ],
            resources=["*"],
        )
        task_role.add_to_policy(transcribe_policy)

        # Grant DynamoDB permissions to ECS task roles
        task_role.add_to_policy(
            iam.PolicyStatement(
                actions=[
                    "dynamodb:PutItem",
                    "dynamodb:GetItem",
                    "dynamodb:UpdateItem",
                    "dynamodb:DeleteItem",
                    "dynamodb:Query",
                    "dynamodb:Scan",
                ],
                resources=[processed_files_table.table_arn],
            )
        )

        # Add OpenSearch Permissions
        opensearch_policy = iam.PolicyStatement(
            effect=iam.Effect.ALLOW,
            actions=[
                "aoss:APIAccessAll",
            ],
            resources=["*"],
        )
        task_role.add_to_policy(opensearch_policy)

        video_log_group = logs.LogGroup(
            self,
            "VideoLogGroup",
            log_group_name="/ecs/video-service",
            removal_policy=RemovalPolicy.DESTROY,
        )

        audio_log_group = logs.LogGroup(
            self,
            "AudioLogGroup",
            log_group_name="/ecs/audio-service",
            removal_policy=RemovalPolicy.DESTROY,
        )

        routing_lambda = lambda_.Function(
            self,
            "RoutingLambda",
            runtime=lambda_.Runtime.PYTHON_3_13,
            handler="routing_lambda.lambda_handler",
            code=lambda_.Code.from_asset("src/ingest/routing"),
            timeout=Duration.minutes(1),
            memory_size=1024,
            environment={
                "DEFAULT_BUCKET": input_assets_bucket.bucket_name,
                "PROCESSED_FILES_TABLE": processed_files_table.table_name,
            },
        )

        text_lambda = lambda_.Function(
            self,
            "TextLambda",
            runtime=lambda_.Runtime.PYTHON_3_13,
            handler="text_lambda.lambda_handler",
            code=lambda_.Code.from_asset(
                "src/ingest/text",
                bundling=BundlingOptions(
                    image=lambda_.Runtime.PYTHON_3_13.bundling_image,
                    command=[
                        "bash",
                        "-c",
                        "pip install -r requirements.txt -t /asset-output && cp -au . /asset-output",
                    ],
                ),
            ),
            timeout=Duration.minutes(1),
            memory_size=128,
            environment={
                "INDEX_NAME": opensearch_index_name,
                "OPENSEARCH_ENDPOINT": opensearch_endpoint,
                "EMBEDDINGS_MODEL_ID": embeddings_model_id,
                "CHUNK_SIZE": chunk_size,
                "OVERLAP": overlap,
                "PROCESSED_FILES_TABLE": processed_files_table.table_name,
            },
        )

        # Create PDF Lambda function using container built from local source
        pdf_lambda = lambda_.DockerImageFunction(
            self,
            "PDFProcessingLambda",
            code=lambda_.DockerImageCode.from_image_asset(
                directory="src/ingest/pdf",
                asset_name="pdf-service",
                platform=ecr_assets.Platform.LINUX_AMD64,
            ),
            memory_size=2048,  # 2GB memory
            timeout=Duration.minutes(15),
            environment={
                "INDEX_NAME": opensearch_index_name,
                "OPENSEARCH_ENDPOINT": opensearch_endpoint,
                "EMBEDDINGS_MODEL_ID": embeddings_model_id,
                "PROCESSED_FILES_TABLE": processed_files_table.table_name,
            },
            allow_public_subnet=True,
            log_retention=logs.RetentionDays.ONE_WEEK,
        )

        # Add necessary permissions to the PDF Lambda role
        pdf_lambda.role.add_managed_policy(
            iam.ManagedPolicy.from_aws_managed_policy_name("AmazonTextractFullAccess")
        )
        pdf_lambda.role.add_managed_policy(
            iam.ManagedPolicy.from_aws_managed_policy_name("AmazonBedrockFullAccess")
        )
        input_assets_bucket.grant_read_write(pdf_lambda)
        pdf_lambda.add_to_role_policy(
            iam.PolicyStatement(actions=["aoss:APIAccessAll"], resources=["*"])
        )

        input_assets_bucket.grant_read(text_lambda)
        text_lambda.add_to_role_policy(
            iam.PolicyStatement(actions=["bedrock:InvokeModel"], resources=["*"])
        )
        text_lambda.add_to_role_policy(
            iam.PolicyStatement(actions=["aoss:APIAccessAll"], resources=["*"])
        )

        # Create file size checker Lambda
        check_file_size_lambda = lambda_.Function(
            self,
            "CheckFileSizeLambda",
            runtime=lambda_.Runtime.PYTHON_3_13,
            handler="check_file_size.lambda_handler",
            code=lambda_.Code.from_asset("src/ingest/video_chunker"),
            timeout=Duration.minutes(1),
            memory_size=256,
        )
        # Grant minimal permissions: get object metadata to check size
        check_file_size_lambda.add_to_role_policy(
            iam.PolicyStatement(
                actions=[
                    "s3:GetObject",           # Read object and metadata
                    "s3:GetBucketLocation",   # Required for S3 operations
                ],
                resources=[
                    input_assets_bucket.bucket_arn,       # Bucket itself
                    f"{input_assets_bucket.bucket_arn}/*",  # Objects in bucket
                ],
            )
        )

        # Create video chunking Lambda (Docker image with FFmpeg)
        chunk_video_lambda = lambda_.DockerImageFunction(
            self,
            "ChunkVideoLambda",
            code=lambda_.DockerImageCode.from_image_asset(
                directory="src/ingest/video_chunker",
                asset_name="video-chunker-service",
                platform=ecr_assets.Platform.LINUX_AMD64,
            ),
            memory_size=10240,  # 10GB memory for large video processing
            timeout=Duration.minutes(15),
            ephemeral_storage_size=Size.mebibytes(10240),  # 10GB ephemeral storage for /tmp
            allow_public_subnet=True,
            log_retention=logs.RetentionDays.ONE_WEEK,
        )
        # Grant minimal permissions: get, put, and delete objects only
        chunk_video_lambda.add_to_role_policy(
            iam.PolicyStatement(
                actions=[
                    "s3:GetObject",           # Download original video
                    "s3:PutObject",           # Upload chunks
                    "s3:DeleteObject",        # Delete original after chunking
                    "s3:GetBucketLocation",   # Required for S3 operations
                ],
                resources=[
                    input_assets_bucket.bucket_arn,       # Bucket itself
                    f"{input_assets_bucket.bucket_arn}/*",  # Objects in bucket
                ],
            )
        )

        # Create quarantine Lambda for failed files
        quarantine_lambda = lambda_.Function(
            self,
            "QuarantineFailedFileLambda",
            runtime=lambda_.Runtime.PYTHON_3_13,
            handler="quarantine_failed_file.lambda_handler",
            code=lambda_.Code.from_asset("src/ingest/video_chunker"),
            timeout=Duration.minutes(1),
            memory_size=256,
            environment={
                "PROCESSED_FILES_TABLE": processed_files_table.table_name,
            },
        )
        # Grant permissions to copy and delete objects for quarantine
        quarantine_lambda.add_to_role_policy(
            iam.PolicyStatement(
                actions=[
                    "s3:GetObject",           # Read original file metadata
                    "s3:PutObject",           # Copy to quarantine location
                    "s3:DeleteObject",        # Delete original after copy
                    "s3:GetBucketLocation",   # Required for S3 operations
                ],
                resources=[
                    input_assets_bucket.bucket_arn,       # Bucket itself
                    f"{input_assets_bucket.bucket_arn}/*",  # Objects in bucket
                ],
            )
        )
        # Grant DynamoDB permissions to mark files as quarantined
        processed_files_table.grant_read_write_data(quarantine_lambda)

        video_task_definition = ecs.FargateTaskDefinition(
            self,
            "VideoTaskDefinition",
            memory_limit_mib=16384,
            cpu=8192,
            execution_role=execution_role,
            task_role=task_role,
        )

        video_container = video_task_definition.add_container(
            "VideoContainer",
            image=ecs.ContainerImage.from_asset(
                directory="src/ingest/video",
                asset_name="video-service",
                platform=ecr_assets.Platform.LINUX_AMD64,
            ),
            logging=ecs.LogDriver.aws_logs(
                stream_prefix="video-service",
                log_group=video_log_group,
            ),
            environment={
                "INDEX_NAME": opensearch_index_name,
                "OPENSEARCH_ENDPOINT": opensearch_endpoint,
                "EMBEDDINGS_MODEL_ID": embeddings_model_id,
                "VIDEO_TEXT_MODEL_ID": video_text_model_id,
                "AWS_DEFAULT_REGION": region,
                "PROCESSED_FILES_TABLE": processed_files_table.table_name,
            },
        )

        audio_task_definition = ecs.FargateTaskDefinition(
            self,
            "AudioTaskDefinition",
            memory_limit_mib=2048,
            cpu=1024,
            execution_role=execution_role,
            task_role=task_role,
        )

        audio_container = audio_task_definition.add_container(
            "AudioContainer",
            image=ecs.ContainerImage.from_asset(
                directory="src/ingest/audio",
                asset_name="audio-service",
                platform=ecr_assets.Platform.LINUX_AMD64,
            ),
            logging=ecs.LogDriver.aws_logs(
                stream_prefix="audio-service",
                log_group=audio_log_group,
            ),
            environment={
                "INDEX_NAME": opensearch_index_name,
                "OPENSEARCH_ENDPOINT": opensearch_endpoint,
                "EMBEDDINGS_MODEL_ID": embeddings_model_id,
                "AUDIO_TEXT_MODEL_ID": video_text_model_id,
                "AWS_DEFAULT_REGION": region,
                "PROCESSED_FILES_TABLE": processed_files_table.table_name,
            },
        )

        #################################################################################
        # STEP FUNCTION DEFINITION
        #################################################################################

        # Create security group for ECS tasks
        security_group = ec2.SecurityGroup(
            self,
            "EcsSecurityGroup",
            vpc=vpc,
            description="Security group for ECS tasks",
            allow_all_outbound=True,
        )

        process_bucket_data = tasks.LambdaInvoke(
            self,
            "routing-task",
            lambda_function=routing_lambda,
            payload=sfn.TaskInput.from_json_path_at("$"),
            result_path="$.routing_result",
            retry_on_service_exceptions=True,
        )

        input_assets_bucket.grant_read_write(routing_lambda)

        # Grant DynamoDB permissions to Lambda functions
        processed_files_table.grant_read_write_data(routing_lambda)
        processed_files_table.grant_read_write_data(text_lambda)
        processed_files_table.grant_read_write_data(pdf_lambda)

        # Define the nested state machine for the Map state
        choice = sfn.Choice(self, "Choice")

        # Audio branch
        start_audio_transcription = tasks.CallAwsService(
            self,
            "StartAudioTranscriptionJob",
            service="transcribe",
            action="startTranscriptionJob",
            parameters={
                "TranscriptionJobName.$": "States.Format('{}-{}', $.lambda_name, States.UUID())",
                "LanguageCode": "en-US",
                "MediaFormat.$": "$.data_type",
                "Media": {"MediaFileUri.$": "$.s3_uri"},
                "Settings": {"ShowSpeakerLabels": True, "MaxSpeakerLabels": 5},
            },
            iam_resources=["*"],
        )

        wait_audio_transcribe = sfn.Wait(
            self,
            "WaitAudioTranscribe",
            time=sfn.WaitTime.duration(Duration.minutes(1)),
        )

        get_audio_transcription = tasks.CallAwsService(
            self,
            "GetAudioTranscriptionJob",
            service="transcribe",
            action="getTranscriptionJob",
            parameters={
                "TranscriptionJobName.$": "$.TranscriptionJob.TranscriptionJobName"
            },
            iam_resources=["*"],
        )

        audio_job_complete = sfn.Choice(self, "AudioJobComplete")

        process_audio = tasks.EcsRunTask(
            self,
            "audio-task",
            integration_pattern=sfn.IntegrationPattern.RUN_JOB,
            cluster=cluster,
            task_definition=audio_task_definition,
            assign_public_ip=True,
            container_overrides=[
                tasks.ContainerOverride(
                    container_definition=audio_container,
                    environment=[
                        tasks.TaskEnvironmentVariable(
                            name="STEP_FUNCTION_INPUT",
                            value=sfn.JsonPath.string_at("States.JsonToString($)"),
                        ),
                    ],
                )
            ],
            launch_target=tasks.EcsFargateLaunchTarget(
                platform_version=ecs.FargatePlatformVersion.LATEST,
            ),
            security_groups=[security_group],
            result_path="$.audio_result",
        )

        delete_transcription_job = tasks.CallAwsService(
            self,
            "DeleteTranscriptionJob",
            service="transcribe",
            action="deleteTranscriptionJob",
            parameters={
                "TranscriptionJobName.$": "$.TranscriptionJob.TranscriptionJobName"
            },
            iam_resources=["*"],
        )

        # Video branch - Start with file size check
        check_video_file_size = tasks.LambdaInvoke(
            self,
            "CheckVideoFileSize",
            lambda_function=check_file_size_lambda,
            payload=sfn.TaskInput.from_json_path_at("$"),
            result_path="$",
            output_path="$.Payload",
            retry_on_service_exceptions=True,
        )

        # Choice state: does video need chunking?
        video_needs_chunking = sfn.Choice(self, "VideoNeedsChunking")

        # Chunk video if too large
        chunk_large_video = tasks.LambdaInvoke(
            self,
            "ChunkLargeVideo",
            lambda_function=chunk_video_lambda,
            payload=sfn.TaskInput.from_json_path_at("$"),
            result_path="$.chunking_result",
            output_path="$.chunking_result.Payload",
            retry_on_service_exceptions=True,
        )

        # Process chunked videos with a Map state
        process_video_chunks_map = sfn.Map(
            self,
            "ProcessVideoChunks",
            max_concurrency=3,
            items_path="$.chunks",
            parameters={
                "s3_uri.$": "$$.Map.Item.Value.s3_uri",
                "bucket.$": "$$.Map.Item.Value.bucket",
                "key.$": "$$.Map.Item.Value.key",
                "lambda_name.$": "$$.Map.Item.Value.lambda_name",
                "data_type.$": "$$.Map.Item.Value.data_type",
                "timestamp.$": "$$.Map.Item.Value.timestamp",
                "chunk_num.$": "$$.Map.Item.Value.chunk_num",
                "start_time.$": "$$.Map.Item.Value.start_time",
                "duration.$": "$$.Map.Item.Value.duration",
            },
        )

        # Video branch (regular, non-chunked)
        start_video_transcription = tasks.CallAwsService(
            self,
            "StartVideoTranscriptionJob",
            service="transcribe",
            action="startTranscriptionJob",
            parameters={
                "TranscriptionJobName.$": "States.Format('{}-{}', $.lambda_name, States.UUID())",
                "LanguageCode": "en-US",
                "MediaFormat.$": "$.data_type",
                "Media": {"MediaFileUri.$": "$.s3_uri"},
                "Settings": {"ShowSpeakerLabels": True, "MaxSpeakerLabels": 5},
            },
            iam_resources=["*"],
        )

        # Chunk transcription (for chunked videos)
        start_chunk_transcription = tasks.CallAwsService(
            self,
            "StartChunkTranscriptionJob",
            service="transcribe",
            action="startTranscriptionJob",
            parameters={
                "TranscriptionJobName.$": "States.Format('{}-chunk-{}-{}', $.lambda_name, $.chunk_num, States.UUID())",
                "LanguageCode": "en-US",
                "MediaFormat.$": "$.data_type",
                "Media": {"MediaFileUri.$": "$.s3_uri"},
                "Settings": {"ShowSpeakerLabels": True, "MaxSpeakerLabels": 5},
            },
            iam_resources=["*"],
        )

        wait_video_transcribe = sfn.Wait(
            self,
            "WaitVideoTranscribe",
            time=sfn.WaitTime.duration(Duration.minutes(1)),
        )

        get_video_transcription = tasks.CallAwsService(
            self,
            "GetVideoTranscriptionJob",
            service="transcribe",
            action="getTranscriptionJob",
            parameters={
                "TranscriptionJobName.$": "$.TranscriptionJob.TranscriptionJobName"
            },
            iam_resources=["*"],
        )

        video_job_complete = sfn.Choice(self, "VideoJobComplete")

        # Chunk transcription wait and check states
        wait_chunk_transcribe = sfn.Wait(
            self,
            "WaitChunkTranscribe",
            time=sfn.WaitTime.duration(Duration.minutes(1)),
        )

        get_chunk_transcription = tasks.CallAwsService(
            self,
            "GetChunkTranscriptionJob",
            service="transcribe",
            action="getTranscriptionJob",
            parameters={
                "TranscriptionJobName.$": "$.TranscriptionJob.TranscriptionJobName"
            },
            iam_resources=["*"],
        )

        chunk_job_complete = sfn.Choice(self, "ChunkJobComplete")

        # Delete chunk transcription job
        delete_chunk_transcription_job = tasks.CallAwsService(
            self,
            "DeleteChunkTranscriptionJob",
            service="transcribe",
            action="deleteTranscriptionJob",
            parameters={
                "TranscriptionJobName.$": "$.TranscriptionJob.TranscriptionJobName"
            },
            iam_resources=["*"],
        )

        process_video = tasks.EcsRunTask(
            self,
            "video-task",
            integration_pattern=sfn.IntegrationPattern.RUN_JOB,
            cluster=cluster,
            task_definition=video_task_definition,
            assign_public_ip=True,
            container_overrides=[
                tasks.ContainerOverride(
                    container_definition=video_container,
                    environment=[
                        tasks.TaskEnvironmentVariable(
                            name="STEP_FUNCTION_INPUT",
                            value=sfn.JsonPath.string_at("States.JsonToString($)"),
                        ),
                    ],
                )
            ],
            launch_target=tasks.EcsFargateLaunchTarget(
                platform_version=ecs.FargatePlatformVersion.LATEST,
            ),
            security_groups=[security_group],
            result_path="$.video_result",
        )

        # Separate task for processing video chunks (same task definition, different state)
        process_video_chunk = tasks.EcsRunTask(
            self,
            "video-chunk-task",
            integration_pattern=sfn.IntegrationPattern.RUN_JOB,
            cluster=cluster,
            task_definition=video_task_definition,
            assign_public_ip=True,
            container_overrides=[
                tasks.ContainerOverride(
                    container_definition=video_container,
                    environment=[
                        tasks.TaskEnvironmentVariable(
                            name="STEP_FUNCTION_INPUT",
                            value=sfn.JsonPath.string_at("States.JsonToString($)"),
                        ),
                    ],
                )
            ],
            launch_target=tasks.EcsFargateLaunchTarget(
                platform_version=ecs.FargatePlatformVersion.LATEST,
            ),
            security_groups=[security_group],
            result_path="$.video_result",
        )

        # PDF branch
        process_pdf = tasks.LambdaInvoke(
            self,
            "pdf-task",
            lambda_function=pdf_lambda,
            payload=sfn.TaskInput.from_json_path_at("$"),
            result_path="$.pdf_result",
            retry_on_service_exceptions=True,
        )

        # Text branch
        process_text = tasks.LambdaInvoke(
            self,
            "text-task",
            lambda_function=text_lambda,
            payload=sfn.TaskInput.from_json_path_at("$"),
            result_path="$.text_result",
            retry_on_service_exceptions=True,
        )

        # Connect audio branch
        start_audio_transcription.next(wait_audio_transcribe)
        wait_audio_transcribe.next(get_audio_transcription)
        get_audio_transcription.next(audio_job_complete)

        # Quarantine failed audio
        quarantine_failed_audio = tasks.LambdaInvoke(
            self,
            "QuarantineFailedAudio",
            lambda_function=quarantine_lambda,
            payload=sfn.TaskInput.from_object({
                "s3_uri": sfn.JsonPath.string_at("$.TranscriptionJob.Media.MediaFileUri"),
                "error": sfn.JsonPath.string_at("$.TranscriptionJob.FailureReason"),
                "cause": "Audio transcription job failed",
                "original_data": sfn.JsonPath.entire_payload,
            }),
            result_path="$.quarantine_result",
            retry_on_service_exceptions=True,
        )

        # Succeed state after quarantine (don't fail the entire workflow)
        audio_quarantine_success = sfn.Succeed(
            self,
            "AudioQuarantineSuccess",
            comment="Failed audio moved to quarantine folder"
        )

        quarantine_failed_audio.next(audio_quarantine_success)

        audio_job_complete.when(
            sfn.Condition.string_equals(
                "$.TranscriptionJob.TranscriptionJobStatus", "COMPLETED"
            ),
            process_audio,
        )
        audio_job_complete.when(
            sfn.Condition.string_equals(
                "$.TranscriptionJob.TranscriptionJobStatus", "FAILED"
            ),
            quarantine_failed_audio,
        )
        audio_job_complete.otherwise(wait_audio_transcribe)

        process_audio.next(delete_transcription_job)

        # Connect video branch - NEW WORKFLOW
        # Step 1: Check file size
        check_video_file_size.next(video_needs_chunking)

        # Step 2a: If needs chunking, chunk the video then process chunks
        video_needs_chunking.when(
            sfn.Condition.boolean_equals("$.needs_chunking", True),
            chunk_large_video,
        )

        # Step 2b: If doesn't need chunking, proceed with normal flow
        video_needs_chunking.otherwise(start_video_transcription)

        # Connect chunk workflow
        start_chunk_transcription.next(wait_chunk_transcribe)
        wait_chunk_transcribe.next(get_chunk_transcription)
        get_chunk_transcription.next(chunk_job_complete)

        # Quarantine failed chunk
        quarantine_failed_chunk = tasks.LambdaInvoke(
            self,
            "QuarantineFailedChunk",
            lambda_function=quarantine_lambda,
            payload=sfn.TaskInput.from_object({
                "s3_uri": sfn.JsonPath.string_at("$.TranscriptionJob.Media.MediaFileUri"),
                "error": sfn.JsonPath.string_at("$.TranscriptionJob.FailureReason"),
                "cause": "Chunk transcription job failed",
                "original_data": sfn.JsonPath.entire_payload,
            }),
            result_path="$.quarantine_result",
            retry_on_service_exceptions=True,
        )

        # Succeed state after quarantine (don't fail the entire workflow)
        chunk_quarantine_success = sfn.Succeed(
            self,
            "ChunkQuarantineSuccess",
            comment="Failed chunk moved to quarantine folder"
        )

        quarantine_failed_chunk.next(chunk_quarantine_success)

        chunk_job_complete.when(
            sfn.Condition.string_equals(
                "$.TranscriptionJob.TranscriptionJobStatus", "COMPLETED"
            ),
            process_video_chunk,
        )
        chunk_job_complete.when(
            sfn.Condition.string_equals(
                "$.TranscriptionJob.TranscriptionJobStatus", "FAILED"
            ),
            quarantine_failed_chunk,
        )
        chunk_job_complete.otherwise(wait_chunk_transcribe)

        # Process each chunk with video processor
        process_video_chunk.next(delete_chunk_transcription_job)

        # Connect chunk map state
        process_video_chunks_map.item_processor(start_chunk_transcription)
        chunk_large_video.next(process_video_chunks_map)

        # Connect regular (non-chunked) video workflow
        start_video_transcription.next(wait_video_transcribe)
        wait_video_transcribe.next(get_video_transcription)
        get_video_transcription.next(video_job_complete)

        # Quarantine failed video
        quarantine_failed_video = tasks.LambdaInvoke(
            self,
            "QuarantineFailedVideo",
            lambda_function=quarantine_lambda,
            payload=sfn.TaskInput.from_object({
                "s3_uri": sfn.JsonPath.string_at("$.TranscriptionJob.Media.MediaFileUri"),
                "error": sfn.JsonPath.string_at("$.TranscriptionJob.FailureReason"),
                "cause": "Video transcription job failed",
                "original_data": sfn.JsonPath.entire_payload,
            }),
            result_path="$.quarantine_result",
            retry_on_service_exceptions=True,
        )

        # Succeed state after quarantine (don't fail the entire workflow)
        video_quarantine_success = sfn.Succeed(
            self,
            "VideoQuarantineSuccess",
            comment="Failed video moved to quarantine folder"
        )

        quarantine_failed_video.next(video_quarantine_success)

        video_job_complete.when(
            sfn.Condition.string_equals(
                "$.TranscriptionJob.TranscriptionJobStatus", "COMPLETED"
            ),
            process_video,
        )
        video_job_complete.when(
            sfn.Condition.string_equals(
                "$.TranscriptionJob.TranscriptionJobStatus", "FAILED"
            ),
            quarantine_failed_video,
        )
        video_job_complete.otherwise(wait_video_transcribe)

        process_video.next(delete_transcription_job)

        # Connect the branches to the choice state
        choice.when(
            sfn.Condition.string_matches("$.lambda_name", "process-video"),
            check_video_file_size,  # Changed to start with file size check
        )
        choice.when(
            sfn.Condition.string_matches("$.lambda_name", "process-audio"),
            start_audio_transcription,
        )
        choice.when(
            sfn.Condition.string_matches("$.lambda_name", "process-pdf"),
            process_pdf,
        )
        choice.otherwise(process_text)

        # Define the Map state
        map_state = sfn.Map(
            self,
            "Map",
            max_concurrency=max_concurrency,
            input_path="$",
            items_path="$.routing_result.Payload",
        ).item_processor(choice)

        # Connect Process-Bucket-Data to Map state
        process_bucket_data.next(map_state)

        # Create the state machine
        state_machine = sfn.StateMachine(
            self,
            "DataIngestionStateMachine",
            definition=process_bucket_data,
            timeout=Duration.hours(step_function_timeout_hours),
        )

        state_machine.add_to_role_policy(
            iam.PolicyStatement(
                actions=[
                    "s3:GetObject",
                    "s3:ListBucket",
                    "s3:PutObject",
                    "s3:DeleteObject",
                ],
                resources=[
                    input_assets_bucket.bucket_arn,
                    f"{input_assets_bucket.bucket_arn}/*",
                ],
            )
        )

        state_machine.add_to_role_policy(transcribe_policy)

        self.bucket_arn = input_assets_bucket.bucket_arn
        self.opensearch_endpoint = opensearch_endpoint
        self.collection_arn = collection_arn
        self.step_function_arn = state_machine.state_machine_arn
        self.processed_files_table_name = processed_files_table.table_name

        CfnOutput(
            self,
            "InputBucketName",
            value=input_assets_bucket.bucket_name,
        )

        CfnOutput(
            self,
            "StepFunctionArn",
            value=state_machine.state_machine_arn,
            description="ARN of the Step Function for data ingestion",
        )

        CfnOutput(
            self,
            "ProcessedFilesTableName",
            value=processed_files_table.table_name,
            description="DynamoDB table for tracking processed files",
        )
