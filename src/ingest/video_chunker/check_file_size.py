import json
import logging
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

s3_client = boto3.client("s3")

# Size threshold in bytes (1.8 GB to leave buffer before 2GB limit)
SIZE_THRESHOLD_BYTES = 1.8 * 1024 * 1024 * 1024  # 1,932,735,283 bytes


def parse_s3_uri(s3_uri):
    """Parse S3 URI into bucket and key."""
    if s3_uri.startswith("s3://"):
        s3_uri = s3_uri[5:]
    parts = s3_uri.split("/", 1)
    bucket = parts[0]
    key = parts[1] if len(parts) > 1 else ""
    return bucket, key


def lambda_handler(event, context):
    """
    Check the size of an S3 object and determine if it needs chunking.

    Input event format:
    {
        "s3_uri": "s3://bucket/key",
        "lambda_name": "process-video",
        "data_type": "mp4",
        ...other fields
    }

    Output:
    {
        ...original event fields,
        "file_size_bytes": 1234567890,
        "file_size_gb": 1.15,
        "needs_chunking": true/false,
        "size_threshold_gb": 1.8
    }
    """
    try:
        s3_uri = event.get("s3_uri")
        if not s3_uri:
            raise ValueError("Missing 's3_uri' in event")

        logger.info(f"Checking file size for: {s3_uri}")

        # Parse S3 URI
        bucket, key = parse_s3_uri(s3_uri)

        # Get object metadata
        response = s3_client.head_object(Bucket=bucket, Key=key)
        file_size_bytes = response["ContentLength"]
        file_size_gb = file_size_bytes / (1024 ** 3)

        # Determine if chunking is needed
        needs_chunking = file_size_bytes > SIZE_THRESHOLD_BYTES

        logger.info(
            f"File size: {file_size_gb:.2f} GB ({file_size_bytes:,} bytes), "
            f"Needs chunking: {needs_chunking}"
        )

        # Return enriched event
        result = {
            **event,  # Preserve all original fields
            "file_size_bytes": file_size_bytes,
            "file_size_gb": round(file_size_gb, 2),
            "needs_chunking": needs_chunking,
            "size_threshold_gb": 1.8,
        }

        return result

    except ClientError as e:
        error_msg = f"AWS Client Error: {str(e)}"
        logger.error(error_msg)
        raise Exception(error_msg)
    except Exception as e:
        error_msg = f"Error checking file size: {str(e)}"
        logger.error(error_msg)
        raise Exception(error_msg)
