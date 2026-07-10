"""
Container entrypoint for the cloud content-sync collector job.

Runs the three collection stages in order:
  1. confluence_processor      - scrape Confluence, write asset CSV, upload direct assets
  2. confluence_event_descriptions_to_s3 - upload per-event .txt descriptions
  3. google_drive_processor    - download Drive folder contents and upload to S3

Writes a run_summary.json (and the generated CSV) to
s3://<bucket>/sync-runs/<run_id>/ for the notify lambda, prints the summary,
and exits non-zero if any stage raised or reported failed uploads.
"""
import json
import os
import sys
import time
import traceback

import boto3  # type: ignore
import yaml  # type: ignore

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SYNC_RUNS_PREFIX = "sync-runs"


def run_stage(name: str, main_fn, summary: dict) -> None:
    print(f"\n===== Stage: {name} =====", flush=True)
    started = time.time()
    stage = {"status": "succeeded", "counts": {}, "error": None}
    try:
        stage["counts"] = main_fn() or {}
        if stage["counts"].get("failed"):
            stage["status"] = "completed_with_failures"
    except Exception as e:
        traceback.print_exc()
        stage["status"] = "crashed"
        stage["error"] = f"{type(e).__name__}: {e}"
    stage["duration_seconds"] = round(time.time() - started, 1)
    summary["stages"][name] = stage
    print(f"===== Stage {name}: {stage['status']} in {stage['duration_seconds']}s =====", flush=True)


def main() -> int:
    # The processor scripts use paths relative to their own directory
    os.chdir(SCRIPT_DIR)

    config_path = os.path.join(SCRIPT_DIR, "..", "..", "config.yaml")
    with open(config_path, "r") as f:
        config = yaml.safe_load(f)
    bucket = config["s3_bucket_name"]
    region = config.get("aws_region", "us-west-2")

    run_id = os.getenv("RUN_ID") or time.strftime("local-%Y%m%d-%H%M%S", time.gmtime())
    summary = {"run_id": run_id, "stages": {}}
    started = time.time()

    import confluence_processor
    import confluence_event_descriptions_to_s3
    import google_drive_processor

    run_stage("confluence_assets", confluence_processor.main, summary)
    run_stage("event_descriptions", confluence_event_descriptions_to_s3.main, summary)
    run_stage("google_drive", google_drive_processor.main, summary)

    stages = summary["stages"].values()
    summary["duration_seconds"] = round(time.time() - started, 1)
    summary["status"] = (
        "succeeded" if all(s["status"] == "succeeded" for s in stages) else "failed"
    )

    print("\n===== Run summary =====")
    print(json.dumps(summary, indent=2), flush=True)

    s3 = boto3.client("s3", region_name=region)
    s3.put_object(
        Bucket=bucket,
        Key=f"{SYNC_RUNS_PREFIX}/{run_id}/run_summary.json",
        Body=json.dumps(summary, indent=2).encode(),
        ContentType="application/json",
    )
    csv_path = os.path.join(SCRIPT_DIR, confluence_processor.ASSET_LINKS_CSV)
    if os.path.exists(csv_path):
        s3.upload_file(
            csv_path, bucket, f"{SYNC_RUNS_PREFIX}/{run_id}/confluence_asset_links.csv"
        )
    print(f"Run summary written to s3://{bucket}/{SYNC_RUNS_PREFIX}/{run_id}/run_summary.json")

    return 0 if summary["status"] == "succeeded" else 1


if __name__ == "__main__":
    sys.exit(main())
