#!/usr/bin/env python3
"""
Simple script to upload files from google_drive_downloads/ to S3.
Useful for uploading leftover files from failed runs.
"""
import os
import sys
import yaml
from s3_uploader import S3Uploader

# Add parent directory to path to import config
project_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
config_path = os.path.join(project_root, "config.yaml")

# Load config
with open(config_path, "r") as f:
    config = yaml.safe_load(f)

# Configuration
UPLOAD_DIR = config.get("google_drive_download_dir", "google_drive_downloads")
S3_BUCKET = config["s3_bucket_name"]
AWS_REGION = config.get("aws_region", "us-west-2")
SKIP_EXISTING = config.get("skip_existing_s3_files", True)
IS_MEMBER_CONTENT = False  # Default to false for leftover files

def main():
    # Check if directory exists
    if not os.path.exists(UPLOAD_DIR):
        print(f"Directory {UPLOAD_DIR} does not exist.")
        sys.exit(1)

    # Get list of files
    files = [f for f in os.listdir(UPLOAD_DIR) if os.path.isfile(os.path.join(UPLOAD_DIR, f))]

    if not files:
        print(f"No files found in {UPLOAD_DIR}")
        sys.exit(0)

    print(f"Found {len(files)} files in {UPLOAD_DIR}")
    if SKIP_EXISTING:
        print("Skip existing S3 files is ENABLED")
    else:
        print("Skip existing S3 files is DISABLED")
    print()

    # Initialize S3 uploader
    uploader = S3Uploader(bucket_name=S3_BUCKET, region_name=AWS_REGION)

    # Upload each file
    uploaded_count = 0
    skipped_count = 0
    failed_count = 0
    files_to_potentially_delete = []

    for filename in sorted(files):
        file_path = os.path.join(UPLOAD_DIR, filename)
        s3_key = filename  # Use filename as S3 key

        print(f"Processing: {filename}")

        # Check if file exists BEFORE uploading (to track if it was skipped)
        file_already_exists = SKIP_EXISTING and uploader.file_exists(s3_key)

        # Upload to S3
        success = uploader.upload_file(
            file_path,
            s3_key,
            IS_MEMBER_CONTENT,
            skip_if_exists=SKIP_EXISTING
        )

        if success:
            if file_already_exists:
                skipped_count += 1
                files_to_potentially_delete.append((filename, file_path))
            else:
                uploaded_count += 1
                # Only delete if upload was successful and not skipped
                os.remove(file_path)
                print(f"Deleted local file: {filename}")
        else:
            failed_count += 1
            print(f"Failed to upload: {filename}")

        print()

    # Ask user if they want to delete skipped files that already exist in S3
    if files_to_potentially_delete:
        print("=" * 60)
        print(f"\nFound {len(files_to_potentially_delete)} file(s) already in S3:")
        for filename, _ in files_to_potentially_delete:
            print(f"  - {filename}")

        print("\nThese files were not re-uploaded because they already exist in S3.")
        response = input("Do you want to delete these local files? (y/n): ").strip().lower()

        if response == 'y':
            for filename, file_path in files_to_potentially_delete:
                os.remove(file_path)
                print(f"Deleted: {filename}")
            print(f"\nDeleted {len(files_to_potentially_delete)} local file(s).")
        else:
            print("\nKept local files.")

    # Summary
    print("=" * 60)
    print("Upload Summary:")
    print(f"  Total files processed: {len(files)}")
    print(f"  Successfully uploaded: {uploaded_count}")
    print(f"  Skipped (already in S3): {skipped_count}")
    print(f"  Failed: {failed_count}")
    print("=" * 60)

if __name__ == "__main__":
    main()
