"""
Kickoff lambda for the content-sync pipeline.

Invoked manually (one command from a laptop). Starts the ContentSyncPipeline
state machine unless an execution is already running, and returns the
execution ARN plus a console link.
"""
import json
import os
import time

import boto3

sfn = boto3.client("stepfunctions")

STATE_MACHINE_ARN = os.environ["STATE_MACHINE_ARN"]


def _console_url(execution_arn: str) -> str:
    region = execution_arn.split(":")[3]
    return (
        f"https://{region}.console.aws.amazon.com/states/home"
        f"?region={region}#/v2/executions/details/{execution_arn}"
    )


def handler(event, context):
    # Refuse to double-start: two collectors racing would fight over the
    # same S3 keys and skew each other's skip-existing logic
    running = sfn.list_executions(
        stateMachineArn=STATE_MACHINE_ARN, statusFilter="RUNNING", maxResults=1
    )["executions"]
    if running:
        execution = running[0]
        return {
            "started": False,
            "message": "A content-sync run is already in progress.",
            "executionArn": execution["executionArn"],
            "consoleUrl": _console_url(execution["executionArn"]),
        }

    name = time.strftime("content-sync-%Y%m%d-%H%M%S", time.gmtime())
    execution = sfn.start_execution(
        stateMachineArn=STATE_MACHINE_ARN,
        name=name,
        input=json.dumps(event if isinstance(event, dict) else {}),
    )
    return {
        "started": True,
        "runId": name,
        "executionArn": execution["executionArn"],
        "consoleUrl": _console_url(execution["executionArn"]),
    }
