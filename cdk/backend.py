from aws_cdk import (
    BundlingOptions,
    CfnOutput,
    Duration,
    RemovalPolicy,
    Stack,
)
from aws_cdk import (
    aws_apigateway as apigw,
)
from aws_cdk import (
    aws_dynamodb as dynamodb,
)
from aws_cdk import (
    aws_iam as iam,
)
from aws_cdk import (
    aws_lambda as _lambda,
)
from aws_cdk import (
    aws_ssm as ssm,
)
from aws_cdk import (
    custom_resources as cr,
)
from constructs import Construct


class RagBackend(Construct):
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        opensearch_endpoint: str,
        opensearch_index_name: str,
        opensearch_collection_arn: str,
        chat_model: str,
        embedding_model: str,
        chat_prompt: str,
        classifier_model: str,
        document_filter_model: str,
        platform_classifier_prompt: str,
        document_filter_prompt: str,
        bucket_arn: str,
        docs_retrieved: int,
        docs_after_falloff: int,
        conversation_history_turns: int = 4,
        max_history_characters: int = 100000,
        temperature: float = 1.0,
        top_p: float = 0.999,
        max_tokens: int = 4096,
        frontend_distribution_domain: str = None,
        user_pool=None,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)
        
        # Create Parameter Store entries for prompts
        chat_prompt_param = ssm.StringParameter(
            self, "ChatPromptParameter",
            parameter_name="/chatbot/prompts/chat",
            string_value=chat_prompt
        )
        
        classifier_prompt_param = ssm.StringParameter(
            self, "ClassifierPromptParameter", 
            parameter_name="/chatbot/prompts/classifier",
            string_value=platform_classifier_prompt
        )
        
        filter_prompt_param = ssm.StringParameter(
            self, "FilterPromptParameter",
            parameter_name="/chatbot/prompts/filter", 
            string_value=document_filter_prompt
        )
        
        # Create DynamoDB table for conversation history
        conversation_table = dynamodb.Table(
            self,
            "ConversationHistory",
            partition_key=dynamodb.Attribute(
                name="session_id", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="timestamp", type=dynamodb.AttributeType.NUMBER
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,
        )
        
        #################################################################################
        # CDK FOR THE LAMBDA WHICH SERVES THE API
        #################################################################################

        # Define the Lambda function
        chat_lambda = _lambda.Function(
            self,
            "ChatbotConversationHandler",
            runtime=_lambda.Runtime.PYTHON_3_13,
            code=_lambda.Code.from_asset(
                "src/backend",
                bundling=BundlingOptions(
                    image=_lambda.Runtime.PYTHON_3_13.bundling_image,
                    command=[
                        "bash",
                        "-c",
                        "pip install --platform manylinux2014_x86_64 --implementation cp --python-version 3.13 --only-binary=:all: --target /asset-output -r requirements.txt && cp -au . /asset-output",
                    ],
                ),
            ),
            handler="chatbot_backend.lambda_handler",
            timeout=Duration.seconds(60),
            environment={
                "OPENSEARCH_ENDPOINT": opensearch_endpoint,
                "OPENSEARCH_INDEX": opensearch_index_name,
                "CHAT_MODEL_ID": chat_model,
                "EMBEDDING_MODEL_ID": embedding_model,
                "CLASSIFIER_MODEL_ID": classifier_model,
                "DOCUMENT_FILTER_MODEL_ID": document_filter_model,
                "CONVERSATION_TABLE": conversation_table.table_name,
                "DOCS_RETRIEVED": str(docs_retrieved),
                "DOCS_AFTER_FALLOFF": str(docs_after_falloff),
                "CONVERSATION_HISTORY_TURNS": str(conversation_history_turns),
                "MAX_HISTORY_CHARACTERS": str(max_history_characters),
                "TEMPERATURE": str(temperature),
                "TOP_P": str(top_p),
                "MAX_TOKENS": str(max_tokens),
            },
        )

        # Add SSM permissions
        chat_lambda.add_to_role_policy(
            iam.PolicyStatement(
                actions=["ssm:GetParameter"],
                resources=[
                    chat_prompt_param.parameter_arn,
                    classifier_prompt_param.parameter_arn,
                    filter_prompt_param.parameter_arn
                ]
            )
        )

        chat_lambda.add_to_role_policy(
            iam.PolicyStatement(
                actions=["s3:GetObject"],
                resources=[f"{bucket_arn}/*"],
                effect=iam.Effect.ALLOW,
            )
        )

        # Grant DynamoDB permissions
        conversation_table.grant_read_write_data(chat_lambda)

        # Bedrock: invoke only, scoped to foundation models and inference
        # profiles (a model routed via a cross-region profile needs the profile
        # ARN too). Replaces AmazonBedrockFullAccess, which also grants model
        # management/provisioning the app never uses.
        chat_lambda.add_to_role_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "bedrock:InvokeModel",
                    "bedrock:InvokeModelWithResponseStream",
                ],
                resources=[
                    "arn:aws:bedrock:*::foundation-model/*",
                    f"arn:aws:bedrock:*:{Stack.of(self).account}:inference-profile/*",
                ],
            )
        )

        # OpenSearch Serverless (aoss) data access, scoped to this collection.
        # AmazonOpenSearchServiceFullAccess (managed-domain es:* access) was
        # removed — the app uses Serverless only, covered entirely by this.
        opensearch_policy = iam.PolicyStatement(
            effect=iam.Effect.ALLOW,
            actions=[
                "aoss:APIAccessAll",
            ],
            resources=[opensearch_collection_arn],
        )

        # Attach inline policy to the Lambda role
        chat_lambda.role.add_to_policy(opensearch_policy)

        # Define the Lambda function for feedback
        feedback_lambda = _lambda.Function(
            self,
            "FeedbackHandler",
            runtime=_lambda.Runtime.PYTHON_3_13,
            code=_lambda.Code.from_asset(
                "src/backend",
                bundling=BundlingOptions(
                    image=_lambda.Runtime.PYTHON_3_13.bundling_image,
                    command=[
                        "bash",
                        "-c",
                        "pip install --platform manylinux2014_x86_64 --implementation cp --python-version 3.13 --only-binary=:all: --target /asset-output -r requirements.txt && cp -au . /asset-output",
                    ],
                ),
            ),
            handler="feedback.feedback_handler",
            timeout=Duration.seconds(30),
            environment={
                "CONVERSATION_TABLE": conversation_table.table_name,
            },
        )

        # Grant DynamoDB permissions to feedback lambda
        conversation_table.grant_read_write_data(feedback_lambda)

        #################################################################################
        # CDK FOR API
        #################################################################################
        # Define the API Gateway
        api = apigw.RestApi(
            self,
            "RagAPI",
            rest_api_name="RagChatbotAPI",
            description="API Gateway to be served by a lambda",
        )

        # Create chat-response resource and method
        chat_resource = api.root.add_resource("chat-response")
        chat_integration = apigw.LambdaIntegration(chat_lambda, proxy=True)
        chat_resource.add_method("POST", chat_integration, api_key_required=True)

        # Create feedback resource and method
        feedback_resource = api.root.add_resource("feedback")
        feedback_integration = apigw.LambdaIntegration(feedback_lambda, proxy=True)
        feedback_resource.add_method("POST", feedback_integration, api_key_required=True)

        # Add CORS support for chat-response
        chat_resource.add_method(
            "OPTIONS",
            apigw.MockIntegration(
                integration_responses=[
                    apigw.IntegrationResponse(
                        status_code="200",
                        response_parameters={
                            "method.response.header.Access-Control-Allow-Headers": "'Content-Type,X-Amz-Date,Authorization,X-Api-Key'",
                            "method.response.header.Access-Control-Allow-Origin": "'*'",
                            "method.response.header.Access-Control-Allow-Methods": "'OPTIONS,POST'",
                        },
                    )
                ],
                request_templates={"application/json": '{"statusCode": 200}'},
            ),
            method_responses=[
                apigw.MethodResponse(
                    status_code="200",
                    response_parameters={
                        "method.response.header.Access-Control-Allow-Headers": True,
                        "method.response.header.Access-Control-Allow-Origin": True,
                        "method.response.header.Access-Control-Allow-Methods": True,
                    },
                )
            ],
        )

        # Add CORS support for feedback
        feedback_resource.add_method(
            "OPTIONS",
            apigw.MockIntegration(
                integration_responses=[
                    apigw.IntegrationResponse(
                        status_code="200",
                        response_parameters={
                            "method.response.header.Access-Control-Allow-Headers": "'Content-Type,X-Amz-Date,Authorization,X-Api-Key'",
                            "method.response.header.Access-Control-Allow-Origin": "'*'",
                            "method.response.header.Access-Control-Allow-Methods": "'OPTIONS,POST'",
                        },
                    )
                ],
                request_templates={"application/json": '{"statusCode": 200}'},
            ),
            method_responses=[
                apigw.MethodResponse(
                    status_code="200",
                    response_parameters={
                        "method.response.header.Access-Control-Allow-Headers": True,
                        "method.response.header.Access-Control-Allow-Origin": True,
                        "method.response.header.Access-Control-Allow-Methods": True,
                    },
                )
            ],
        )

        # Create API Key
        api_key = apigw.ApiKey(
            self,
            "RagChatbotApiKey",
            api_key_name="RagChatAPIKey",
            description="API key for accessing RagChatbotAPI",
        )

        # Create Usage Plan and associate with API Key and API Stage
        usage_plan = apigw.UsagePlan(
            self,
            "RagChatUsagePlan",
            name="RagChatUsagePlan",
            throttle=apigw.ThrottleSettings(
                rate_limit=10,
                burst_limit=2,
            ),
            quota=apigw.QuotaSettings(limit=1000, period=apigw.Period.DAY),
        )

        usage_plan.add_api_key(api_key)
        usage_plan.add_api_stage(stage=api.deployment_stage)

        # Publish the GENERATED key value to SSM so the proxy lambda and CLI
        # clients read one authoritative copy - the value never lives in
        # config.yaml or the CloudFormation template
        stack = Stack.of(self)
        api_key_arn = (
            f"arn:{stack.partition}:apigateway:{stack.region}::/apikeys/{api_key.key_id}"
        )
        api_key_value_lookup = cr.AwsCustomResource(
            self,
            "ApiKeyValueLookup",
            on_update=cr.AwsSdkCall(
                service="APIGateway",
                action="getApiKey",
                parameters={"apiKey": api_key.key_id, "includeValue": True},
                physical_resource_id=cr.PhysicalResourceId.of(
                    f"apikey-value-{api_key.key_id}"
                ),
            ),
            # API Gateway IAM uses HTTP-verb actions (apigateway:GET), which
            # from_sdk_calls would mis-derive as apigateway:GetApiKey
            policy=cr.AwsCustomResourcePolicy.from_statements(
                [
                    iam.PolicyStatement(
                        actions=["apigateway:GET"],
                        resources=[api_key_arn],
                    )
                ]
            ),
        )
        api_key_param = ssm.StringParameter(
            self, "ApiKeyParameter",
            parameter_name="/chatbot/api-key",
            string_value=api_key_value_lookup.get_response_field("value"),
            description="API Gateway API Key for backend authentication"
        )

        self.api_url = api.url

        #################################################################################
        # CDK FOR PROXY API (Frontend-facing, no API key required)
        #################################################################################

        # Create proxy Lambda (forwards to the key-secured backend API)
        proxy_lambda = _lambda.Function(
            self,
            "ProxyHandler",
            runtime=_lambda.Runtime.PYTHON_3_13,
            code=_lambda.Code.from_asset(
                "src/proxy",
                bundling=BundlingOptions(
                    image=_lambda.Runtime.PYTHON_3_13.bundling_image,
                    command=[
                        "bash",
                        "-c",
                        "pip install --platform manylinux2014_x86_64 --implementation cp --python-version 3.13 --only-binary=:all: --target /asset-output -r requirements.txt && cp -au . /asset-output",
                    ],
                ),
            ),
            handler="proxy_handler.lambda_handler",
            timeout=Duration.seconds(70),
            environment={
                "BACKEND_API_URL": api.url,
                "API_KEY_PARAMETER_NAME": api_key_param.parameter_name,
            },
        )

        # Grant SSM permissions to proxy Lambda
        api_key_param.grant_read(proxy_lambda)

        # Create proxy API Gateway (no API key required)
        # Configure CORS to only allow requests from CloudFront distribution
        allowed_origins = (
            [f"https://{frontend_distribution_domain}"]
            if frontend_distribution_domain
            else apigw.Cors.ALL_ORIGINS
        )

        proxy_api = apigw.RestApi(
            self,
            "ProxyAPI",
            rest_api_name="RagChatbotProxyAPI",
            description="Public-facing proxy API (API key secured server-side)",
            # Cap request rate on the public stage so an authenticated caller
            # can't drive unbounded Bedrock spend (S5). Applies to all methods.
            deploy_options=apigw.StageOptions(
                throttling_rate_limit=20,
                throttling_burst_limit=10,
            ),
            default_cors_preflight_options=apigw.CorsOptions(
                allow_origins=allowed_origins,
                allow_methods=apigw.Cors.ALL_METHODS,
                allow_headers=["Content-Type", "Authorization"],
            ),
        )

        # Create /api resource
        api_resource = proxy_api.root.add_resource("api")

        # Cognito authorizer — validates the JWT (signature, issuer, expiry)
        # at the gateway, before the proxy Lambda runs. Optional so deploys
        # without SAML config still work.
        method_auth = {}
        if user_pool is not None:
            authorizer = apigw.CognitoUserPoolsAuthorizer(
                self, "ChatProxyAuthorizer", cognito_user_pools=[user_pool]
            )
            method_auth = {
                "authorizer": authorizer,
                "authorization_type": apigw.AuthorizationType.COGNITO,
            }

        # Create /api/chat-response resource
        chat_proxy_resource = api_resource.add_resource("chat-response")
        chat_proxy_integration = apigw.LambdaIntegration(proxy_lambda, proxy=True)
        chat_proxy_resource.add_method(
            "POST", chat_proxy_integration, api_key_required=False, **method_auth
        )

        # Create /api/feedback resource
        feedback_proxy_resource = api_resource.add_resource("feedback")
        feedback_proxy_integration = apigw.LambdaIntegration(proxy_lambda, proxy=True)
        feedback_proxy_resource.add_method(
            "POST", feedback_proxy_integration, api_key_required=False, **method_auth
        )

        # Store proxy API URL for output
        self.proxy_api_url = proxy_api.url

        CfnOutput(
            self,
            "ProxyAPIEndpoint",
            value=self.proxy_api_url,
            description="Public proxy API endpoint (use this in frontend)",
        )

        CfnOutput(
            self,
            "OpensearchAPIEndpoint",
            value=opensearch_endpoint,
        )
        
        CfnOutput(
            self,
            "ConversationTableName",
            value=conversation_table.table_name,
        )
