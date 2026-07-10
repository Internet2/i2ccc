import os
from typing import Optional

import boto3 #type: ignore


class S3Uploader:
    def __init__(self, bucket_name: str, region_name: str):
        self.bucket_name = bucket_name
        self.s3_client = boto3.client("s3", region_name=region_name)
        self._existing_keys: Optional[set] = None

    def get_existing_keys(self) -> set:
        """
        List every object key in the bucket once and cache the result, so
        existence checks are in-memory lookups instead of per-file HEAD requests.
        """
        if self._existing_keys is None:
            keys = set()
            paginator = self.s3_client.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=self.bucket_name):
                for obj in page.get("Contents", []):
                    keys.add(obj["Key"])
            self._existing_keys = keys
            print(f"Loaded {len(keys)} existing object keys from s3://{self.bucket_name}")
        return self._existing_keys

    def file_exists(self, s3_object_key: str) -> bool:
        """
        Check if a file exists in S3, including the quarantine/ folder.
        """
        existing_keys = self.get_existing_keys()
        if s3_object_key in existing_keys:
            print(f"Found existing file at: s3://{self.bucket_name}/{s3_object_key}")
            return True
        quarantine_key = f"quarantine/{s3_object_key}"
        if quarantine_key in existing_keys:
            print(f"Found existing file in quarantine: s3://{self.bucket_name}/{quarantine_key}")
            return True
        return False

    def upload_file(
        self,
        file_path: str,
        s3_object_name_relative_to_subfolder: str,
        is_subscriber_content: bool,
        source_url: Optional[str] = None,
        parent_folder_name: Optional[str] = None,
        parent_folder_url: Optional[str] = None,
        relative_start_time: Optional[int] = None,
        skip_if_exists: bool = False,
    ) -> bool:
        """
        Uploads a file to S3 with specified metadata.

        Args:
            skip_if_exists: If True, skip upload if file already exists in S3
        """
        s3_object_key = s3_object_name_relative_to_subfolder.replace("\\", "/")

        # Check if file exists and skip if requested
        if skip_if_exists and self.file_exists(s3_object_key):
            print(f"Skipping {os.path.basename(file_path)} - already exists in S3")
            return True

        extra_args = {
            "Metadata": {
                "member-content": "true" if is_subscriber_content else "false"
            }
        }

        if source_url:
            extra_args["Metadata"]["source-url"] = source_url
        if parent_folder_name:
            extra_args["Metadata"]["parent-folder-name"] = parent_folder_name
        if parent_folder_url:
            extra_args["Metadata"]["parent-folder-url"] = parent_folder_url
        if relative_start_time is not None:
            extra_args["Metadata"]["relative-start-time"] = str(
                relative_start_time
            )

        try:
            print(
                f"Uploading {file_path} to s3://{self.bucket_name}/{s3_object_key} with metadata member-content: {'true' if is_subscriber_content else 'false'}{', source-url: ' + source_url if source_url else ''}{', parent-folder-name: ' + parent_folder_name if parent_folder_name else ''}{', parent-folder-url: ' + parent_folder_url if parent_folder_url else ''}"
            )
            self.s3_client.upload_file(
                file_path, self.bucket_name, s3_object_key, ExtraArgs=extra_args
            )
            if self._existing_keys is not None:
                self._existing_keys.add(s3_object_key)
            print(f"Successfully uploaded {os.path.basename(file_path)}")
            return True
        except Exception as e:
            print(f"Error uploading {os.path.basename(file_path)}: {e}")
            return False
