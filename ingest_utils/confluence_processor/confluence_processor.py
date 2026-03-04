import os
import re
from typing import Optional

import pandas as pd #type: ignore
import requests #type: ignore
import yaml  #type: ignore
from dotenv import load_dotenv
from confluence_scraper import ConfluenceScraper
from s3_uploader import S3Uploader

DOWNLOAD_DIR = "confluence_downloads"
ASSET_LINKS_CSV = "confluence_asset_links.csv"


def _sanitize_drive_file_url(url):
    if not url:
        return url
    match = re.match(r"(https://drive\.google\.com/file/d/[^/]+)", url)
    if match:
        return match.group(1)
    match = re.match(
        r"(https://docs\.google\.com/(?:document|spreadsheets|presentation)/d/[^/]+)",
        url,
    )
    if match:
        return match.group(1)
    match = re.match(r"(https://drive\.google\.com/drive/folders/[^/?]+)", url)
    if match:
        return match.group(1)
    return url


def download_file(url: str, output_path: str) -> Optional[str]:
    """
    Downloads a file from a given URL to the specified output path.
    Returns the path if successful, None otherwise.
    """
    # Use browser user-agent to bypass bot protection
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    try:
        response = requests.get(url, stream=True, headers=headers)
        response.raise_for_status()  # Raise an HTTPError for bad responses (4xx or 5xx)

        with open(output_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        print(f"Downloaded: {url} -> {output_path}")
        return output_path
    except requests.exceptions.RequestException as e:
        print(f"Error downloading {url}: {e}")
        return None


def main():
    # Load config from config.yaml
    config_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "config.yaml")
    with open(config_path, "r") as f:
        config = yaml.safe_load(f)

    # Load environment variables
    env_file = config.get("env_file", "names.env")
    load_dotenv(env_file)

    confluence_api_token = os.getenv("CONFLUENCE_API")
    if not confluence_api_token:
        print("WARNING: CONFLUENCE_API token not found in environment. Authentication may fail.")
        print(f"Please set CONFLUENCE_API in your {env_file} file.")

    confluence_urls = config.get("confluence_urls", [])

    # Backward compatibility: if confluence_url exists, use it
    if not confluence_urls and "confluence_url" in config:
        confluence_urls = [config["confluence_url"]]

    if not confluence_urls:
        print("No Confluence URLs found in config. Please add confluence_urls to config.yaml")
        return

    s3_bucket_name = config["s3_bucket_name"]
    aws_region = config.get("aws_region", "us-west-2")
    s3_subfolder = config.get("s3_subfolder", "").strip()
    skip_existing = config.get("skip_existing_s3_files", False)

    if skip_existing:
        print("Skip existing S3 files is ENABLED - will not re-upload existing files")
    else:
        print("Skip existing S3 files is DISABLED - will overwrite existing files")

    os.makedirs(DOWNLOAD_DIR, exist_ok=True)

    uploader = S3Uploader(bucket_name=s3_bucket_name, region_name=aws_region)

    # Scrape assets from all Confluence URLs
    all_assets = []
    for confluence_url in confluence_urls:
        print(f"\nScraping assets from: {confluence_url}")
        scraper = ConfluenceScraper(base_url=confluence_url, api_token=confluence_api_token)
        assets = scraper.scrape_assets()

        if assets:
            print(f"Found {len(assets)} assets from {confluence_url}")
            all_assets.extend(assets)
        else:
            print(f"No assets found from {confluence_url}")

    if not all_assets:
        print("\nNo assets found from any Confluence URL. Exiting.")
        return

    # Sanitize all Google Drive links before saving to CSV
    for asset in all_assets:
        if "url" in asset:
            asset["url"] = _sanitize_drive_file_url(asset["url"])

    # Save all extracted links to a CSV file
    print(f"\nSaving extracted asset links to {ASSET_LINKS_CSV}")
    df_links = pd.DataFrame(all_assets)
    df_links.to_csv(ASSET_LINKS_CSV, index=False)
    print(f"Total assets found from all Confluence URLs: {len(all_assets)}")

    # Process and upload files based on rules
    for asset in all_assets:
        url = asset["url"]
        file_type = asset["file_type"]
        is_subscriber_content = asset["is_subscriber_content"]

        # Determine local file name from URL
        file_name = url.split("/")[-1].split("?")[
            0
        ]  # Get filename and remove  params
        if (
            not file_name or "." not in file_name
        ):  # Handle cases where filename is not clear
            file_name = f"downloaded_asset.{file_type}"

        output_path = os.path.join(DOWNLOAD_DIR, file_name)

        print(f"Processing asset: {url}")

        downloaded_file_path = download_file(url, output_path)

        if downloaded_file_path:
            # Prepend the s3_subfolder to the S3 object key if provided
            if s3_subfolder:
                s3_object_key = f"{s3_subfolder.rstrip('/')}/{file_name}"
            else:
                s3_object_key = file_name
            uploader.upload_file(
                downloaded_file_path, s3_object_key, is_subscriber_content, skip_if_exists=skip_existing
            )
            os.remove(downloaded_file_path)  # Clean up local file after upload

    print("\nConfluence asset processing complete.")


if __name__ == "__main__":
    main()
