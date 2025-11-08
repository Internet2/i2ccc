import json
import logging
import os
import time
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

s3_client = boto3.client("s3")

# Get DynamoDB table name from environment variable
PROCESSED_FILES_TABLE = os.getenv("PROCESSED_FILES_TABLE")

# Initialize DynamoDB client
dynamodb = boto3.resource("dynamodb")
processed_files_table = dynamodb.Table(PROCESSED_FILES_TABLE) if PROCESSED_FILES_TABLE else None


def parse_s3_uri(s3_uri):
    """Parse S3 URI into bucket and key."""
    if s3_uri.startswith("s3://"):
        s3_uri = s3_uri[5:]
    parts = s3_uri.split("/", 1)
    bucket = parts[0]
    key = parts[1] if len(parts) > 1 else ""
    return bucket, key


def mark_file_quarantined(s3_uri):
    """Mark a file as quarantined in DynamoDB to prevent reprocessing."""
    if not processed_files_table:
        logger.warning("PROCESSED_FILES_TABLE not configured, skipping DynamoDB update")
        return

    try:
        processed_files_table.put_item(
            Item={
                "s3_uri": s3_uri,
                "timestamp": int(time.time()),
                "processor": "quarantine_lambda"
            }
        )
        logger.info(f"Marked {s3_uri} as quarantined in DynamoDB")
    except Exception as e:
        logger.error(f"Error marking file as quarantined in DynamoDB: {str(e)}")
        # Don't fail the quarantine operation if DynamoDB update fails
        pass


def lambda_handler(event, context):
    """
    Move a failed file to quarantine folder in S3.

    Input event format:
    {
        "s3_uri": "s3://bucket/data/video.mp4",
        "error": "The data in your input media file isn't valid",
        "cause": "Transcription job failed",
        ...other fields
    }

    Output:
    {
        "original_s3_uri": "s3://bucket/data/video.mp4",
        "quarantine_s3_uri": "s3://bucket/quarantine/video.mp4",
        "status": "quarantined",
        "error": "The data in your input media file isn't valid"
    }
    """
    try:
        s3_uri = event.get("s3_uri")
        if not s3_uri:
            raise ValueError("Missing 's3_uri' in event")

        logger.info(f"Quarantining failed file: {s3_uri}")

        # Parse S3 URI
        bucket, key = parse_s3_uri(s3_uri)

        # Construct quarantine path
        # If key is "data/video.mp4", move to "quarantine/video.mp4"
        if key.startswith("data/"):
            quarantine_key = key.replace("data/", "quarantine/", 1)
        else:
            # If not in data folder, just prefix with quarantine/
            quarantine_key = f"quarantine/{key}"

        logger.info(f"Moving {key} -> {quarantine_key}")

        # Copy to quarantine location
        copy_source = {"Bucket": bucket, "Key": key}
        s3_client.copy_object(
            CopySource=copy_source,
            Bucket=bucket,
            Key=quarantine_key
        )
        logger.info(f"Copied to quarantine: {quarantine_key}")

        # Delete original file
        s3_client.delete_object(Bucket=bucket, Key=key)
        logger.info(f"Deleted original file: {key}")

        quarantine_s3_uri = f"s3://{bucket}/{quarantine_key}"

        # Mark original file as quarantined in DynamoDB to prevent reprocessing
        mark_file_quarantined(s3_uri)

        result = {
            "original_s3_uri": s3_uri,
            "quarantine_s3_uri": quarantine_s3_uri,
            "status": "quarantined",
            "error": event.get("error", "Unknown error"),
            "cause": event.get("cause", "Processing failed")
        }

        logger.info(f"Successfully quarantined file: {s3_uri} -> {quarantine_s3_uri}")
        return result

    except ClientError as e:
        error_msg = f"AWS Client Error while quarantining file: {str(e)}"
        logger.error(error_msg)
        raise Exception(error_msg)
    except Exception as e:
        error_msg = f"Error quarantining file: {str(e)}"
        logger.error(error_msg)
        raise Exception(error_msg)
