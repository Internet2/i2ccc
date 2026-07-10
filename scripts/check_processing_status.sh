#!/bin/bash
set -e

echo "=== Finding ProcessedFiles Table ==="
TABLE_NAME=$(aws dynamodb list-tables --query "TableNames[?contains(@, 'ProcessedFiles')]" --output text | head -1)

if [ -z "$TABLE_NAME" ]; then
    echo "ERROR: Could not find ProcessedFiles table"
    exit 1
fi

echo "Found table: $TABLE_NAME"
echo ""

echo "=== Total Files Already Processed ==="
COUNT=$(aws dynamodb scan --table-name "$TABLE_NAME" --select "COUNT" --query "Count" --output text)
echo "$COUNT files have been successfully processed"
echo ""

echo "=== Recently Processed Files (last 10) ==="
aws dynamodb scan \
  --table-name "$TABLE_NAME" \
  --query "Items | sort_by(@, &timestamp.N) | [-10:] | [*].{S3_URI:s3_uri.S, Processor:processor.S}" \
  --output table

echo ""
echo "=== Total Files in S3 Bucket ==="
BUCKET=$(grep "s3_bucket_name:" config.yaml | awk '{print $2}')
if [ ! -z "$BUCKET" ]; then
    TOTAL=$(aws s3 ls s3://$BUCKET --recursive | wc -l)
    echo "$TOTAL total files in S3 (including generated files)"

    # Count only processable input files (excluding generated outputs)
    # Supported extensions: mp4, webm, pdf, mp3, wav, flac, m4a, txt, vtt
    # Exclude patterns: _chunk_NNN.mp4, .transcript.vtt, chunked_jsons/
    PROCESSABLE=$(aws s3 ls s3://$BUCKET --recursive | \
        grep -E "\.(mp4|webm|pdf|mp3|wav|flac|m4a|txt|vtt)$" | \
        grep -v "_chunk_[0-9]\{3\}\." | \
        grep -v "\.transcript\." | \
        grep -v "\.cc\." | \
        grep -v "chunked_jsons/" | \
        wc -l)

    echo "$PROCESSABLE processable input files in S3"
    echo ""
    echo "Files remaining to process: $((PROCESSABLE - COUNT))"
else
    echo "Could not find bucket name in config.yaml"
fi
