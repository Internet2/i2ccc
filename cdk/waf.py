from aws_cdk import (
    RemovalPolicy,
    aws_wafv2 as wafv2,
    aws_logs as logs,
    aws_iam as iam,
)
from constructs import Construct


class Waf(Construct):
    """
    WAF WebACL for CloudFront with:
    - AWS Managed Rules Common Rule Set (OWASP Top 10, XSS, SQLi)
    - AWS Managed Rules SQL Injection Rule Set
    - Rate limiting: 1000 requests per 5 minutes per IP
    - CloudWatch logging
    """

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        rate_limit: int = 1000,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Log group name MUST start with "aws-waf-logs-" for WAF to be allowed to write to it
        log_group = logs.LogGroup(
            self,
            "WafLogGroup",
            log_group_name="aws-waf-logs-rag-chatbot",
            retention=logs.RetentionDays.THREE_MONTHS,
            removal_policy=RemovalPolicy.DESTROY,
        )

        # Resource policy allowing WAF log delivery service to write to the log group
        logs.ResourcePolicy(
            self,
            "WafLogGroupPolicy",
            resource_policy_name="WafLogGroupResourcePolicy",
            policy_statements=[
                iam.PolicyStatement(
                    effect=iam.Effect.ALLOW,
                    principals=[iam.ServicePrincipal("delivery.logs.amazonaws.com")],
                    actions=["logs:CreateLogStream", "logs:PutLogEvents"],
                    resources=[f"{log_group.log_group_arn}:*"],
                    conditions={
                        "StringEquals": {
                            "aws:SourceAccount": scope.node.addr  # resolved at synth
                        }
                    },
                )
            ],
        )

        # WAF WebACL — scope must be CLOUDFRONT for CloudFront associations
        web_acl = wafv2.CfnWebACL(
            self,
            "WebACL",
            name="RagChatbotWebACL",
            scope="CLOUDFRONT",
            default_action=wafv2.CfnWebACL.DefaultActionProperty(allow={}),
            visibility_config=wafv2.CfnWebACL.VisibilityConfigProperty(
                cloud_watch_metrics_enabled=True,
                metric_name="RagChatbotWebACL",
                sampled_requests_enabled=True,
            ),
            rules=[
                # Priority 1: AWS Managed Rules Common Rule Set
                # Covers OWASP Top 10 — XSS, LFI, RFI, bad inputs, known bad bots
                wafv2.CfnWebACL.RuleProperty(
                    name="AWSManagedRulesCommonRuleSet",
                    priority=1,
                    override_action=wafv2.CfnWebACL.OverrideActionProperty(none={}),
                    statement=wafv2.CfnWebACL.StatementProperty(
                        managed_rule_group_statement=wafv2.CfnWebACL.ManagedRuleGroupStatementProperty(
                            vendor_name="AWS",
                            name="AWSManagedRulesCommonRuleSet",
                        )
                    ),
                    visibility_config=wafv2.CfnWebACL.VisibilityConfigProperty(
                        cloud_watch_metrics_enabled=True,
                        metric_name="AWSManagedRulesCommonRuleSet",
                        sampled_requests_enabled=True,
                    ),
                ),
                # Priority 2: Rate-based rule — block IPs exceeding `rate_limit` req / 5 min
                wafv2.CfnWebACL.RuleProperty(
                    name="RateLimitPerIP",
                    priority=2,
                    action=wafv2.CfnWebACL.RuleActionProperty(
                        block={}
                    ),
                    statement=wafv2.CfnWebACL.StatementProperty(
                        rate_based_statement=wafv2.CfnWebACL.RateBasedStatementProperty(
                            limit=rate_limit,
                            aggregate_key_type="IP",
                        )
                    ),
                    visibility_config=wafv2.CfnWebACL.VisibilityConfigProperty(
                        cloud_watch_metrics_enabled=True,
                        metric_name="RateLimitPerIP",
                        sampled_requests_enabled=True,
                    ),
                ),
            ],
        )

        # Associate the WebACL with the CloudWatch log group
        wafv2.CfnLoggingConfiguration(
            self,
            "WafLoggingConfig",
            log_destination_configs=[log_group.log_group_arn],
            resource_arn=web_acl.attr_arn,
        )

        # Expose the WebACL ARN so it can be passed to CloudFront
        self.web_acl_arn = web_acl.attr_arn
