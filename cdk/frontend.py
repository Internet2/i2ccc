from aws_cdk import (
    CfnOutput,
    RemovalPolicy,
    Duration,
)
from aws_cdk import (
    aws_s3 as s3,
)
from aws_cdk import (
    aws_cloudfront as cloudfront,
)
from aws_cdk import (
    aws_cloudfront_origins as origins,
)
from aws_cdk import (
    aws_s3_deployment as s3_deployment,
)
from aws_cdk import (
    aws_lambda as _lambda,
)
from aws_cdk import (
    aws_iam as iam,
)
from constructs import Construct
import hashlib


class RagFrontend(Construct):
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        cloudfront_password: str = None,
        web_acl_id: str = None,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Create S3 bucket for hosting the frontend
        frontend_bucket = s3.Bucket(
            self,
            "FrontendBucket",
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            encryption=s3.BucketEncryption.S3_MANAGED,
        )

        # Create Origin Access Identity for CloudFront
        origin_access_identity = cloudfront.OriginAccessIdentity(
            self,
            "FrontendOAI",
            comment="OAI for RAG Chatbot Frontend"
        )

        # Grant read permissions to CloudFront
        frontend_bucket.grant_read(origin_access_identity)

        # Create Lambda@Edge function for authentication (if password is provided)
        edge_lambda = None
        if cloudfront_password:
            # Generate a secret key for token signing (deterministic based on password)
            secret_key = hashlib.sha256(f"{cloudfront_password}-secret".encode()).hexdigest()

            # Read the Lambda template and inject the password and secret
            import os
            import tempfile
            import shutil

            # Create a temporary directory for the modified Lambda code
            temp_dir = tempfile.mkdtemp()

            # Copy the Lambda code to temp directory
            src_edge_dir = "src/edge"
            for file in os.listdir(src_edge_dir):
                if file.endswith('.py'):
                    src_file = os.path.join(src_edge_dir, file)
                    with open(src_file, 'r') as f:
                        content = f.read()

                    # Replace environment variable usage with hardcoded values
                    content = content.replace(
                        "AUTH_PASSWORD = os.environ.get('AUTH_PASSWORD', '')",
                        f"AUTH_PASSWORD = '{cloudfront_password}'"
                    )
                    content = content.replace(
                        "SECRET_KEY = os.environ.get('SECRET_KEY', 'default-secret-key-change-me')",
                        f"SECRET_KEY = '{secret_key}'"
                    )

                    # Write modified content to temp directory
                    dst_file = os.path.join(temp_dir, file)
                    with open(dst_file, 'w') as f:
                        f.write(content)

            # Create Lambda execution role
            edge_lambda_role = iam.Role(
                self,
                "EdgeLambdaRole",
                assumed_by=iam.CompositePrincipal(
                    iam.ServicePrincipal("lambda.amazonaws.com"),
                    iam.ServicePrincipal("edgelambda.amazonaws.com")
                ),
                managed_policies=[
                    iam.ManagedPolicy.from_aws_managed_policy_name(
                        "service-role/AWSLambdaBasicExecutionRole"
                    )
                ]
            )

            # Create Lambda@Edge function with modified code
            edge_lambda = _lambda.Function(
                self,
                "AuthEdgeLambda",
                runtime=_lambda.Runtime.PYTHON_3_11,
                handler="auth_lambda.lambda_handler",
                code=_lambda.Code.from_asset(temp_dir),
                role=edge_lambda_role,
                timeout=Duration.seconds(5),
                memory_size=128,
                description="Lambda@Edge function for CloudFront authentication"
            )

        # Create CloudFront distribution with granular caching behaviors
        # Default behavior: CACHING_DISABLED for HTML and authentication
        default_behavior_options = {
            "origin": origins.S3Origin(
                frontend_bucket,
                origin_access_identity=origin_access_identity
            ),
            "viewer_protocol_policy": cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            # Use CACHING_DISABLED to allow Set-Cookie headers to pass through for authentication
            "cache_policy": cloudfront.CachePolicy.CACHING_DISABLED,
            "allowed_methods": cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
            "compress": True,
        }

        # Add Lambda@Edge if authentication is enabled
        if edge_lambda:
            default_behavior_options["edge_lambdas"] = [
                cloudfront.EdgeLambda(
                    function_version=edge_lambda.current_version,
                    event_type=cloudfront.LambdaEdgeEventType.VIEWER_REQUEST
                )
            ]

        # Additional behaviors for static assets with aggressive caching
        additional_behaviors = {}

        # Cache static assets from /assets/* path
        assets_behavior_options = {
            "origin": origins.S3Origin(
                frontend_bucket,
                origin_access_identity=origin_access_identity
            ),
            "viewer_protocol_policy": cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            "cache_policy": cloudfront.CachePolicy.CACHING_OPTIMIZED,
            "allowed_methods": cloudfront.AllowedMethods.ALLOW_GET_HEAD,
            "compress": True,
        }

        # Add Lambda@Edge to assets path as well if auth is enabled
        if edge_lambda:
            assets_behavior_options["edge_lambdas"] = [
                cloudfront.EdgeLambda(
                    function_version=edge_lambda.current_version,
                    event_type=cloudfront.LambdaEdgeEventType.VIEWER_REQUEST
                )
            ]

        additional_behaviors["/assets/*"] = cloudfront.BehaviorOptions(**assets_behavior_options)

        distribution = cloudfront.Distribution(
            self,
            "FrontendDistribution",
            default_behavior=cloudfront.BehaviorOptions(**default_behavior_options),
            additional_behaviors=additional_behaviors,
            default_root_object="index.html",
            web_acl_id=web_acl_id,
            error_responses=[
                # SPA routing - redirect all 404s to index.html
                cloudfront.ErrorResponse(
                    http_status=404,
                    response_http_status=200,
                    response_page_path="/index.html",
                    ttl=None,
                ),
                cloudfront.ErrorResponse(
                    http_status=403,
                    response_http_status=200,
                    response_page_path="/index.html",
                    ttl=None,
                ),
            ],
            price_class=cloudfront.PriceClass.PRICE_CLASS_100,
            comment="RAG Chatbot Frontend Distribution",
        )

        # Store the bucket name and distribution for later use
        self.bucket_name = frontend_bucket.bucket_name
        self.distribution_id = distribution.distribution_id
        self.distribution_domain_name = distribution.distribution_domain_name

        # Output the CloudFront URL
        CfnOutput(
            self,
            "CloudFrontURL",
            value=f"https://{distribution.distribution_domain_name}",
            description="CloudFront URL for the frontend application",
        )

        CfnOutput(
            self,
            "FrontendBucketName",
            value=frontend_bucket.bucket_name,
            description="S3 bucket name for frontend hosting",
        )

        CfnOutput(
            self,
            "DistributionId",
            value=distribution.distribution_id,
            description="CloudFront distribution ID",
        )
