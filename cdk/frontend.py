from aws_cdk import (
    CfnOutput,
    RemovalPolicy,
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
    aws_certificatemanager as acm,
)
from constructs import Construct


class RagFrontend(Construct):
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        web_acl_id: str = None,
        domain_name: str = None,
        certificate_arn: str = None,
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

        # Default behavior: caching disabled for HTML
        default_behavior_options = {
            "origin": origins.S3Origin(
                frontend_bucket,
                origin_access_identity=origin_access_identity
            ),
            "viewer_protocol_policy": cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            "cache_policy": cloudfront.CachePolicy.CACHING_DISABLED,
            "allowed_methods": cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
            "compress": True,
        }

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

        distribution_kwargs = {
            "default_behavior": cloudfront.BehaviorOptions(**default_behavior_options),
            "additional_behaviors": {
                "/assets/*": cloudfront.BehaviorOptions(**assets_behavior_options)
            },
            "default_root_object": "index.html",
            "web_acl_id": web_acl_id,
            "error_responses": [
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
            "price_class": cloudfront.PriceClass.PRICE_CLASS_100,
            "comment": "RAG Chatbot Frontend Distribution",
        }

        if domain_name and certificate_arn:
            distribution_kwargs["domain_names"] = [domain_name]
            distribution_kwargs["certificate"] = acm.Certificate.from_certificate_arn(
                self,
                "FrontendCertificate",
                certificate_arn,
            )

        distribution = cloudfront.Distribution(
            self,
            "FrontendDistribution",
            **distribution_kwargs,
        )

        self.bucket_name = frontend_bucket.bucket_name
        self.distribution_id = distribution.distribution_id
        self.distribution_domain_name = distribution.distribution_domain_name
        self.custom_domain_name = domain_name if (domain_name and certificate_arn) else None
        self.public_domain_name = self.custom_domain_name or distribution.distribution_domain_name
        self.public_url = f"https://{self.public_domain_name}"

        CfnOutput(
            self,
            "CloudFrontURL",
            value=f"https://{distribution.distribution_domain_name}",
            description="CloudFront URL for the frontend application",
        )

        if self.custom_domain_name:
            CfnOutput(
                self,
                "CustomDomainURL",
                value=self.public_url,
                description="Custom domain URL for the frontend application",
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
