import json
import logging
import os
import subprocess
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

s3_client = boto3.client("s3")

# Chunk size: 20 minutes per chunk (in seconds)
CHUNK_DURATION_SECONDS = 20 * 60
# Max chunk size target: 1.8 GB
MAX_CHUNK_SIZE_GB = 1.8


def parse_s3_uri(s3_uri):
    """Parse S3 URI into bucket and key."""
    if s3_uri.startswith("s3://"):
        s3_uri = s3_uri[5:]
    parts = s3_uri.split("/", 1)
    bucket = parts[0]
    key = parts[1] if len(parts) > 1 else ""
    return bucket, key


def get_video_duration(file_path):
    """Get video duration in seconds using ffprobe."""
    try:
        cmd = [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            file_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        duration = float(result.stdout.strip())
        logger.info(f"Video duration: {duration:.2f} seconds")
        return duration
    except Exception as e:
        logger.error(f"Error getting video duration: {e}")
        raise


def calculate_chunks(duration_seconds, file_size_bytes):
    """Calculate chunk parameters for splitting video."""
    file_size_gb = file_size_bytes / (1024 ** 3)

    # Determine chunk duration based on file size
    if file_size_gb > MAX_CHUNK_SIZE_GB:
        # Size-based splitting: ensure each chunk is under 1.8GB
        num_chunks_for_size = max(2, int(file_size_gb / MAX_CHUNK_SIZE_GB) + 1)
        chunk_duration = duration_seconds / num_chunks_for_size
    else:
        # Use default 20-minute chunks
        chunk_duration = CHUNK_DURATION_SECONDS

    chunks = []
    num_chunks = int(duration_seconds / chunk_duration) + 1

    for i in range(num_chunks):
        start_time = i * chunk_duration
        if start_time >= duration_seconds:
            continue

        end_time = min(start_time + chunk_duration, duration_seconds)
        actual_duration = end_time - start_time

        # Skip chunks shorter than 2 seconds
        if actual_duration < 2:
            continue

        chunks.append({
            "chunk_num": i + 1,
            "start_time": start_time,
            "duration": actual_duration
        })

    logger.info(f"Calculated {len(chunks)} chunks with duration {chunk_duration:.2f}s each")
    return chunks


def create_video_chunk(input_file, output_file, start_time, duration):
    """Create a video chunk using ffmpeg."""
    try:
        cmd = [
            "ffmpeg",
            "-i", input_file,
            "-ss", str(start_time),
            "-t", str(duration),
            "-c", "copy",  # Copy codec (fast, no re-encoding)
            "-avoid_negative_ts", "make_zero",
            "-y",  # Overwrite output file
            output_file
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        logger.info(f"Created chunk: {output_file}")
        return True
    except subprocess.CalledProcessError as e:
        logger.error(f"FFmpeg error: {e.stderr}")
        raise
    except Exception as e:
        logger.error(f"Error creating video chunk: {e}")
        raise


def lambda_handler(event, context):
    """
    Split a large video file into chunks and upload to S3.

    Input event format:
    {
        "s3_uri": "s3://bucket/key.mp4",
        "file_size_bytes": 2500000000,
        "bucket": "bucket-name",
        "key": "video.mp4",
        ...other fields
    }

    Output:
    {
        "original_s3_uri": "s3://bucket/key.mp4",
        "chunks": [
            {
                "chunk_num": 1,
                "s3_uri": "s3://bucket/key_chunk_001.mp4",
                "start_time": 0.0,
                "duration": 1200.0,
                "bucket": "bucket-name",
                "key": "key_chunk_001.mp4"
            },
            ...
        ],
        "total_chunks": 3
    }
    """
    temp_dir = "/tmp"
    local_video_path = None

    try:
        s3_uri = event.get("s3_uri")
        file_size_bytes = event.get("file_size_bytes")

        if not s3_uri or not file_size_bytes:
            raise ValueError("Missing 's3_uri' or 'file_size_bytes' in event")

        logger.info(f"Chunking video: {s3_uri} ({file_size_bytes / (1024**3):.2f} GB)")

        # Parse S3 URI
        bucket, key = parse_s3_uri(s3_uri)
        filename = os.path.basename(key)
        name_without_ext = os.path.splitext(filename)[0]
        ext = os.path.splitext(filename)[1]

        # Download video from S3
        local_video_path = os.path.join(temp_dir, filename)
        logger.info(f"Downloading video from S3: {bucket}/{key}")
        s3_client.download_file(bucket, key, local_video_path)
        logger.info(f"Downloaded to: {local_video_path}")

        # Get video duration
        duration = get_video_duration(local_video_path)

        # Calculate chunks
        chunks_info = calculate_chunks(duration, file_size_bytes)

        # Create and upload chunks
        chunk_results = []
        for chunk in chunks_info:
            chunk_num = chunk["chunk_num"]
            chunk_filename = f"{name_without_ext}_chunk_{chunk_num:03d}{ext}"
            chunk_local_path = os.path.join(temp_dir, chunk_filename)

            # Create chunk
            logger.info(f"Creating chunk {chunk_num}/{len(chunks_info)}")
            create_video_chunk(
                local_video_path,
                chunk_local_path,
                chunk["start_time"],
                chunk["duration"]
            )

            # Upload chunk to S3
            chunk_key = os.path.join(os.path.dirname(key), chunk_filename)
            logger.info(f"Uploading chunk to S3: {bucket}/{chunk_key}")
            s3_client.upload_file(chunk_local_path, bucket, chunk_key)

            chunk_s3_uri = f"s3://{bucket}/{chunk_key}"
            chunk_results.append({
                "chunk_num": chunk_num,
                "s3_uri": chunk_s3_uri,
                "bucket": bucket,
                "key": chunk_key,
                "start_time": chunk["start_time"],
                "duration": chunk["duration"],
                "lambda_name": event.get("lambda_name", "process-video"),
                "data_type": event.get("data_type", "mp4"),
                "timestamp": event.get("timestamp")
            })

            # Clean up local chunk file
            os.remove(chunk_local_path)
            logger.info(f"Chunk {chunk_num} uploaded and cleaned up")

        # Clean up local video file
        if local_video_path and os.path.exists(local_video_path):
            os.remove(local_video_path)
            logger.info("Original video cleaned up from /tmp")

        # Delete original large video from S3 after successful chunking
        try:
            logger.info(f"Deleting original large video from S3: {bucket}/{key}")
            s3_client.delete_object(Bucket=bucket, Key=key)
            logger.info(f"Successfully deleted original video from S3: {s3_uri}")
        except Exception as e:
            # Log error but don't fail the entire operation since chunks are already created
            logger.error(f"Warning: Failed to delete original video from S3: {str(e)}")
            logger.error("Chunks were successfully created, but original file remains in S3")

        result = {
            "original_s3_uri": s3_uri,
            "original_deleted": True,  # Track that original was deleted
            "chunks": chunk_results,
            "total_chunks": len(chunk_results)
        }

        logger.info(f"Successfully chunked video into {len(chunk_results)} parts and deleted original")
        return result

    except Exception as e:
        error_msg = f"Error chunking video: {str(e)}"
        logger.error(error_msg)

        # Clean up on error
        if local_video_path and os.path.exists(local_video_path):
            os.remove(local_video_path)

        raise Exception(error_msg)
