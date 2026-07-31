# stacks/main_stack.py


from aws_cdk import Stack
from constructs import Construct

from .auth import CognitoSamlAuth
from .backend import RagBackend
from .content_sync import ContentSync
from .conversation_export import ConversationExport
from .frontend import RagFrontend
from .ingest import RagIngest
from .waf import Waf


class RagChatbotStack(Stack):
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        embeddings_model_id: str,
        video_text_model_id: str,
        opensearch_collection_name: str,
        opensearch_index_name: str,
        chat_model: str,
        embedding_model: str,
        chat_prompt: str,
        classifier_model: str,
        document_filter_model: str,
        platform_classifier_prompt: str,
        document_filter_prompt: str,
        config_path: str,
        max_concurrency: int,
        step_function_timeout_hours: int,
        chunk_size: str,
        overlap: str,
        docs_retrieved: int,
        docs_after_falloff: int,
        conversation_history_turns: int = 4,
        max_history_characters: int = 100000,
        temperature: float = 1.0,
        top_p: float = 0.999,
        max_tokens: int = 4096,
        # Cognito / SAML auth (optional)
        cognito_domain_prefix: str = None,
        saml_idp_name: str = None,
        saml_idp_metadata_url: str = None,
        saml_attribute_mapping: dict = None,
        # Custom domain for CloudFront (optional)
        frontend_domain_name: str = None,
        frontend_certificate_arn: str = None,
        # Email(s) for content-sync run notifications - one address or a list
        notification_email: str | list[str] = None,
        # Email(s) for the weekly conversation export - one address or a list
        export_notification_email: str | list[str] = None,
        export_url_expiry_days: int = 7,
        # None keeps every export indefinitely
        export_retention_days: int = None,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        ingest_stack = RagIngest(
            self,
            "RagIngest",
            opensearch_index_name=opensearch_index_name,
            opensearch_collection_name=opensearch_collection_name,
            embeddings_model_id=embeddings_model_id,
            video_text_model_id=video_text_model_id,
            region=self.region,
            max_concurrency=max_concurrency,
            step_function_timeout_hours=step_function_timeout_hours,
            chunk_size=chunk_size,
            overlap=overlap,
        )

        # Create WAF WebACL before CloudFront (must be in us-east-1 for CloudFront scope)
        waf = Waf(self, "Waf")

        # Create frontend first to get CloudFront distribution domain
        frontend_stack = RagFrontend(
            self,
            "RagFrontend",
            web_acl_id=waf.web_acl_arn,
            domain_name=frontend_domain_name,
            certificate_arn=frontend_certificate_arn,
        )

        # Create Cognito SAML auth (optional — only if all required config is provided)
        auth = None
        if all([cognito_domain_prefix, saml_idp_name, saml_idp_metadata_url, saml_attribute_mapping]):
            # Allow both the custom domain (primary) and the default CloudFront URL
            # (fallback) as valid OAuth callbacks.
            extra_callbacks = []
            if frontend_stack.custom_domain_name:
                extra_callbacks.append(f"https://{frontend_stack.distribution_domain_name}")

            auth = CognitoSamlAuth(
                self,
                "CognitoSamlAuth",
                cognito_domain_prefix=cognito_domain_prefix,
                saml_idp_name=saml_idp_name,
                saml_idp_metadata_url=saml_idp_metadata_url,
                saml_attribute_mapping=saml_attribute_mapping,
                cloudfront_url=frontend_stack.public_url,
                extra_callback_urls=extra_callbacks,
            )

        # Create backend stack with frontend domain for CORS configuration
        rag_api_stack = RagBackend(
            self,
            "RagBackend",
            opensearch_endpoint=ingest_stack.opensearch_endpoint,
            opensearch_index_name=opensearch_index_name,
            opensearch_collection_arn=ingest_stack.collection_arn,
            chat_model=chat_model,
            embedding_model=embedding_model,
            chat_prompt=chat_prompt,
            classifier_model=classifier_model,
            document_filter_model=document_filter_model,
            platform_classifier_prompt=platform_classifier_prompt,
            document_filter_prompt=document_filter_prompt,
            bucket_arn=ingest_stack.bucket_arn,
            docs_retrieved=docs_retrieved,
            docs_after_falloff=docs_after_falloff,
            conversation_history_turns=conversation_history_turns,
            max_history_characters=max_history_characters,
            temperature=temperature,
            top_p=top_p,
            max_tokens=max_tokens,
            frontend_distribution_domain=frontend_stack.public_domain_name,
            user_pool=auth.user_pool if auth else None,
        )

        # One-command content collection: collector Fargate task -> data
        # ingestion state machine -> email notification
        ContentSync(
            self,
            "ContentSync",
            cluster=ingest_stack.cluster,
            vpc=ingest_stack.vpc,
            input_assets_bucket=ingest_stack.input_assets_bucket,
            ingestion_state_machine=ingest_stack.state_machine,
            processed_files_table=ingest_stack.processed_files_table,
            notification_email=notification_email,
        )

        # Weekly Excel export of conversations, emailed as a download link so
        # non-engineers can review questions and feedback without AWS access
        ConversationExport(
            self,
            "ConversationExport",
            conversation_table=rag_api_stack.conversation_table,
            export_email=export_notification_email,
            url_expiry_days=export_url_expiry_days,
            retain_exports_days=export_retention_days,
        )
