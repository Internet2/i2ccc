#!/usr/bin/env bash
# Kick off a cloud content-sync run (Confluence scrape + Google Drive -> S3
# -> data ingestion) and print the execution console link. You'll get an
# email when the run finishes.
set -euo pipefail

RESPONSE_FILE=$(mktemp)
trap 'rm -f "$RESPONSE_FILE"' EXIT

aws lambda invoke \
    --function-name content-sync-kickoff \
    --cli-binary-format raw-in-base64-out \
    --payload '{}' \
    "$RESPONSE_FILE" > /dev/null

cat "$RESPONSE_FILE" | python3 -m json.tool
