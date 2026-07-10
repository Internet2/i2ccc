"""
Notify lambda for the content-sync pipeline.

Called by the state machine on both success and failure. Reads the collector's
run_summary.json from S3 (if it exists), composes a plain-text email with
links to the Step Functions execution and the collector's CloudWatch logs,
and publishes it to SNS.
"""
import json
import os

import boto3

s3 = boto3.client("s3")
sns = boto3.client("sns")

SNS_TOPIC_ARN = os.environ["SNS_TOPIC_ARN"]
BUCKET = os.environ["BUCKET"]
COLLECTOR_LOG_GROUP = os.environ["COLLECTOR_LOG_GROUP"]
REGION = os.environ["AWS_REGION"]


def _execution_console_url(execution_arn: str) -> str:
    return (
        f"https://{REGION}.console.aws.amazon.com/states/home"
        f"?region={REGION}#/v2/executions/details/{execution_arn}"
    )


def _log_group_console_url(log_group: str) -> str:
    escaped = log_group.replace("/", "$252F")
    return (
        f"https://{REGION}.console.aws.amazon.com/cloudwatch/home"
        f"?region={REGION}#logsV2:log-groups/log-group/{escaped}"
    )


def _load_run_summary(run_id: str):
    key = f"sync-runs/{run_id}/run_summary.json"
    try:
        body = s3.get_object(Bucket=BUCKET, Key=key)["Body"].read()
        return json.loads(body)
    except Exception as e:
        # A missing summary (collector died early) must never prevent the
        # notification itself from going out
        print(f"Could not load run summary s3://{BUCKET}/{key}: {e}")
        return None


def handler(event, context):
    status = event["status"]  # "SUCCEEDED" or "FAILED"
    run_id = event["run_id"]
    execution_arn = event["execution_arn"]
    failed_stage = event.get("failed_stage")
    error = event.get("error")

    summary = _load_run_summary(run_id)

    lines = [
        f"Content sync run {run_id}: {status}",
        "",
    ]
    if failed_stage:
        lines.append(f"Failed stage: {failed_stage}")
    if error:
        # Step Functions error causes can be long JSON blobs; keep it readable
        error_text = json.dumps(error) if isinstance(error, dict) else str(error)
        lines.append(f"Error: {error_text[:2000]}")
        lines.append("")

    MAX_LISTED_FILES = 100
    if summary:
        lines.append(f"Collector total duration: {summary.get('duration_seconds', '?')}s")
        for stage_name, stage in summary.get("stages", {}).items():
            lines.append(f"\n[{stage_name}] {stage['status']} ({stage.get('duration_seconds', '?')}s)")
            counts = dict(stage.get("counts") or {})
            uploaded_files = counts.pop("uploaded_files", [])
            for count_name, count in counts.items():
                lines.append(f"  {count_name}: {count}")
            if stage.get("error"):
                lines.append(f"  error: {stage['error']}")
            if uploaded_files:
                lines.append("  new files sent to ingestion:")
                for key in uploaded_files[:MAX_LISTED_FILES]:
                    lines.append(f"    - {key}")
                if len(uploaded_files) > MAX_LISTED_FILES:
                    lines.append(
                        f"    ... and {len(uploaded_files) - MAX_LISTED_FILES} more "
                        f"(full list in the run summary JSON)"
                    )
    else:
        lines.append(
            "No run summary was written to S3 - the collector likely failed "
            "before completing. See the logs below."
        )

    lines += [
        "",
        f"Full run summary: s3://{BUCKET}/sync-runs/{run_id}/run_summary.json",
        f"Collector logs: {_log_group_console_url(COLLECTOR_LOG_GROUP)}",
        f"Pipeline execution: {_execution_console_url(execution_arn)}",
    ]

    subject = f"{'✅' if status == 'SUCCEEDED' else '❌'} Content sync {status.lower()}: {run_id}"
    # SNS subjects must be ASCII and under 100 chars
    subject = subject.encode("ascii", errors="ignore").decode().strip()[:100]

    sns.publish(TopicArn=SNS_TOPIC_ARN, Subject=subject, Message="\n".join(lines))
    return {"published": True, "status": status}
