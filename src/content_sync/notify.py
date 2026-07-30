"""
Notify lambda for the ABE content-ingestion pipeline.

Called by the state machine on both success and failure. Reads the collector's
run_summary.json from S3 (if it exists) and publishes a plain-text email built
in two tiers: a plain-language summary for non-technical readers, then the raw
per-stage counters and AWS console links under a TECHNICAL DETAILS divider.

SNS email is plain text only - no HTML - and subjects must be ASCII and under
100 characters, so all layout here is done with spaces.
"""
import datetime
import json
import os
import re

import boto3

s3 = boto3.client("s3")
sns = boto3.client("sns")

SNS_TOPIC_ARN = os.environ["SNS_TOPIC_ARN"]
BUCKET = os.environ["BUCKET"]
COLLECTOR_LOG_GROUP = os.environ["COLLECTOR_LOG_GROUP"]
REGION = os.environ["AWS_REGION"]

RULE = "-" * 68
MAX_LISTED_SESSIONS = 60
MAX_LISTED_FILES = 100
NEXT_RUN = "Fridays at 3:00 AM Eastern"

# Collector stage names -> how they read in the summary section
STAGE_LABELS = {
    "confluence_assets": "Confluence attachments",
    "event_descriptions": "Event descriptions",
    "google_drive": "Google Drive",
}

# The state machine reports which of its two tasks failed, not a collector stage
FAILED_STAGE_LABELS = {
    "collector": "content collection",
    "ingestion": "content processing",
}

# Plain-language rendering of each raw counter the collector reports
COUNT_LABELS = {
    "total_assets": "links and attachments found",
    "events_found": "events found",
    "uploaded": "newly added",
    "already_in_s3": "already in ABE",
    "unsupported_skipped": "skipped, unreadable file type",
    "mp4_dominance_skipped": "skipped in favor of the session video",
    "drive_folders_deferred": "Drive folder links deferred",
    "failed": "errors",
}

# Filename suffixes that say which part of a session a file is
PART_WORDS = {
    "recording": "video",
    "recordings": "video",
    "video": "video",
    "audio": "audio",
    "chat": "chat log",
    "chatlog": "chat log",
    "transcript": "transcript",
    "transcripts": "transcript",
    "captions": "captions",
    "slides": "slides",
    "slide": "slides",
    "deck": "slides",
}

# Fallback part label, for files whose name carries no suffix
PART_BY_EXTENSION = {
    ".mp4": "video",
    ".mov": "video",
    ".webm": "video",
    ".m4a": "audio",
    ".mp3": "audio",
    ".wav": "audio",
    ".pdf": "slides",
    ".ppt": "slides",
    ".pptx": "slides",
    ".vtt": "captions",
    ".srt": "captions",
    ".txt": "document",
    ".md": "document",
    ".doc": "document",
    ".docx": "document",
}

PART_ORDER = [
    "video",
    "audio",
    "slides",
    "captions",
    "transcript",
    "chat log",
    "document",
    "file",
]

_PART_SUFFIX_RE = re.compile(
    r"[-_ ]+(" + "|".join(sorted(PART_WORDS, key=len, reverse=True)) + r")$",
    re.IGNORECASE,
)

# Dates the source systems bury in file names, e.g. "2026 04 28 Google NEXT"
# or "February 24 2026 - Tackling Compliance"
_LEADING_DATE_RE = re.compile(
    r"^(?:\d{4}[-_ ]\d{1,2}[-_ ]\d{1,2}"
    r"|[A-Za-z]{3,9}\.?[-_ ]\d{1,2},?[-_ ]\d{4})"
    r"\s*(?:[-]\s*)?"
)
_DATE_FORMATS = ("%Y %m %d", "%b %d %Y", "%B %d %Y")


def _execution_console_url(execution_arn: str) -> str:
    return (
        f"https://{REGION}.console.aws.amazon.com/states/home"
        f"?region={REGION}#/v2/executions/details/{execution_arn}"
    )


def _log_group_console_url(log_group: str) -> str:
    escaped = log_group.replace("/", "$252F")
    return (
        f"https://{REGION}.console.aws.amazon.com/cloudwatch/home"
        f"?region={REGION}#logsV2:log-groups/log-group/{escaped}"
    )


def _load_run_summary(run_id: str):
    key = f"sync-runs/{run_id}/run_summary.json"
    try:
        body = s3.get_object(Bucket=BUCKET, Key=key)["Body"].read()
        return json.loads(body)
    except Exception as e:
        # A missing summary (collector died early) must never prevent the
        # notification itself from going out
        print(f"Could not load run summary s3://{BUCKET}/{key}: {e}")
        return None


def _run_datetime(run_id: str):
    """Recover the run's start time from run ids like content-sync-20260724-070018."""
    match = re.search(r"(\d{8})-(\d{6})$", run_id)
    if not match:
        return None
    try:
        return datetime.datetime.strptime(
            match.group(1) + match.group(2), "%Y%m%d%H%M%S"
        )
    except ValueError:
        return None


def _human_duration(seconds) -> str:
    try:
        total = int(round(float(seconds)))
    except (TypeError, ValueError):
        return "unknown"
    if total < 60:
        return f"{total}s"
    if total < 3600:
        return f"{total // 60}m {total % 60:02d}s"
    return f"{total // 3600}h {(total % 3600) // 60:02d}m"


def _split_leading_date(stem: str):
    """Return (remainder, 'Apr 28, 2026') for names that start with a date."""
    match = _LEADING_DATE_RE.match(stem)
    if not match:
        return stem, None
    raw = re.sub(r"[-_,]", " ", match.group(0))
    raw = re.sub(r"\s+", " ", raw).strip()
    for fmt in _DATE_FORMATS:
        try:
            parsed = datetime.datetime.strptime(raw, fmt)
        except ValueError:
            continue
        return stem[match.end():], f"{parsed:%b} {parsed.day}, {parsed.year}"
    return stem, None


def _describe_file(key: str):
    """Turn an S3 key into a readable (session title, part label) pair."""
    stem, extension = os.path.splitext(os.path.basename(key))
    part = None
    match = _PART_SUFFIX_RE.search(stem)
    if match:
        part = PART_WORDS[match.group(1).lower()]
        stem = stem[: match.start()]
    stem, date = _split_leading_date(stem)
    title = re.sub(r"[_]+", " ", stem)
    title = re.sub(r"\s+", " ", title).strip(" -")
    if date:
        title = f"{title} ({date})" if title else date
    return title or os.path.basename(key), part or PART_BY_EXTENSION.get(
        extension.lower(), "file"
    )


def _group_sessions(keys):
    """
    Collapse S3 keys into one entry per session, in first-seen order.

    A single session usually arrives as several files - video, audio, chat log -
    and listing it once with its parts reads far better than listing it 3 times.
    """
    sessions = {}
    for key in keys:
        title, part = _describe_file(key)
        group_key = re.sub(r"[^a-z0-9]+", "", title.lower())
        session = sessions.setdefault(group_key, {"title": title, "parts": []})
        if part not in session["parts"]:
            session["parts"].append(part)
        # The longest title in a group is usually the most descriptive one
        if len(title) > len(session["title"]):
            session["title"] = title
    for session in sessions.values():
        session["parts"].sort(
            key=lambda part: PART_ORDER.index(part) if part in PART_ORDER else 99
        )
    return [(s["title"], s["parts"]) for s in sessions.values()]


def _stage_counts(stages):
    return [stage.get("counts") or {} for stage in stages.values()]


def _total(stages, *fields) -> int:
    total = 0
    for counts in _stage_counts(stages):
        for field in fields:
            try:
                total += int(counts.get(field) or 0)
            except (TypeError, ValueError):
                continue
    return total


def _uploaded_keys(stages):
    keys = []
    for counts in _stage_counts(stages):
        keys += list(counts.get("uploaded_files") or [])
    return keys


def _figure(label: str, value, note: str = "") -> str:
    row = f"  {label.ljust(22)}{str(value).rjust(6)}"
    return f"{row}   {note}".rstrip()


def _headline(status: str, failed_stage, added: int, errors: int) -> str:
    if status == "SUCCEEDED":
        opening = (
            f"Completed with {errors} error{'' if errors == 1 else 's'}"
            if errors
            else "Completed successfully"
        )
        if added:
            item = "item" if added == 1 else "items"
            return f"{opening} - {added} new {item} added to ABE."
        return f"{opening} - no new content found this time."
    stage = FAILED_STAGE_LABELS.get(failed_stage, failed_stage or "the pipeline")
    return f"FAILED during {stage}."


def _what_this_means(failed_stage):
    lines = ["WHAT THIS MEANS"]
    if failed_stage == "ingestion":
        lines += [
            "  New files were collected but could not be processed, so they are",
            "  not searchable in ABE yet. Everything already in ABE is unaffected",
            "  and the assistant is working normally.",
        ]
    else:
        lines += [
            "  No new content was added in this run. Everything already in ABE is",
            "  unaffected and the assistant is working normally.",
        ]
    lines += [
        "",
        f"  The next scheduled run is {NEXT_RUN}. No action is needed",
        "  from non-technical readers - the engineering team has the details",
        "  below and will follow up if anything needs fixing sooner.",
        "",
    ]
    return lines


def _whats_new_lines(sessions, added: int, status: str):
    succeeded = status == "SUCCEEDED"
    lines = ["WHAT'S NEW IN ABE" if succeeded else "WHAT WAS COLLECTED"]
    if not sessions:
        if succeeded:
            lines.append(
                "  Nothing new - every source we check was already up to date in ABE."
            )
        else:
            lines.append("  Nothing was added to ABE in this run.")
        lines.append("")
        return lines

    session_word = "session" if len(sessions) == 1 else "sessions"
    file_word = "file" if added == 1 else "files"
    state = "now searchable in ABE" if succeeded else "not searchable in ABE yet"
    lines.append(f"  {len(sessions)} {session_word}, {added} {file_word} - {state}:")
    lines.append("")
    for title, parts in sessions[:MAX_LISTED_SESSIONS]:
        lines.append(f"  - {title}  ({', '.join(parts)})")
    if len(sessions) > MAX_LISTED_SESSIONS:
        lines.append(
            f"  ... and {len(sessions) - MAX_LISTED_SESSIONS} more "
            "(full list in the run summary linked below)"
        )
    lines.append("")
    return lines


def _big_picture_lines(stages, added: int, summary, status: str):
    already = _total(stages, "already_in_s3")
    skipped = _total(stages, "unsupported_skipped", "mp4_dominance_skipped")
    errors = _total(stages, "failed")
    added_label = (
        "Newly added to ABE" if status == "SUCCEEDED" else "Collected this run"
    )
    lines = [
        "THE BIG PICTURE",
        _figure(added_label, added),
        _figure("Already in ABE", already, "(unchanged since the last run)"),
        _figure("Skipped", skipped, "(expected - see below)" if skipped else ""),
        _figure("Errors", errors, "" if errors else "(none)"),
    ]
    if summary and summary.get("duration_seconds") is not None:
        lines.append(
            _figure("Collection time", _human_duration(summary["duration_seconds"]))
        )
    lines.append("")
    return lines


def _sources_lines(stages):
    lines = ["WHERE IT CAME FROM"]
    for name, stage in stages.items():
        counts = stage.get("counts") or {}
        label = STAGE_LABELS.get(name, name.replace("_", " ").capitalize())
        new = int(counts.get("uploaded") or 0)
        already = int(counts.get("already_in_s3") or 0)
        detail = f"{str(new).rjust(4)} new, {str(already).rjust(4)} already in ABE"
        note = "" if stage.get("status") == "succeeded" else "  <- see details below"
        lines.append(f"  {label.ljust(24)}{detail}{note}")
    lines.append("")
    return lines


def _skip_lines(stages):
    unsupported = _total(stages, "unsupported_skipped")
    dominated = _total(stages, "mp4_dominance_skipped")
    deferred = _total(stages, "drive_folders_deferred")
    if not (unsupported or dominated or deferred):
        return []
    lines = ["WHY SOME ITEMS WERE SKIPPED (all expected)"]
    if unsupported:
        lines += [
            f"  {str(unsupported).rjust(4)}  file types ABE cannot read - images, spreadsheets,",
            "        and links out to other websites",
        ]
    if dominated:
        lines += [
            f"  {str(dominated).rjust(4)}  audio and caption files skipped because the video of that",
            "        same session was taken instead - nothing was lost",
        ]
    if deferred:
        lines += [
            f"  {str(deferred).rjust(4)}  Google Drive folder links - their contents are collected",
            "        by the Google Drive step instead of one link at a time",
        ]
    lines.append("")
    return lines


def _technical_lines(summary, run_id, execution_arn, failed_stage, error):
    lines = [RULE, "TECHNICAL DETAILS", ""]
    if failed_stage:
        lines.append(f"Failed stage: {failed_stage}")
    if error:
        # Step Functions error causes can be long JSON blobs; keep it readable
        error_text = json.dumps(error) if isinstance(error, dict) else str(error)
        lines.append(f"Error: {error_text[:2000]}")
        lines.append("")

    if summary:
        lines.append(f"Run id: {run_id}")
        lines.append(
            f"Collector total duration: {summary.get('duration_seconds', '?')}s"
        )
        for stage_name, stage in (summary.get("stages") or {}).items():
            lines.append(
                f"\n[{stage_name}] {stage['status']} "
                f"({stage.get('duration_seconds', '?')}s)"
            )
            counts = dict(stage.get("counts") or {})
            uploaded_files = counts.pop("uploaded_files", [])
            for count_name, count in counts.items():
                label = COUNT_LABELS.get(count_name)
                suffix = f"  ({label})" if label else ""
                lines.append(f"  {count_name}: {count}{suffix}")
            if stage.get("error"):
                lines.append(f"  error: {stage['error']}")
            if uploaded_files:
                lines.append("  files added:")
                for key in uploaded_files[:MAX_LISTED_FILES]:
                    lines.append(f"    - {key}")
                if len(uploaded_files) > MAX_LISTED_FILES:
                    lines.append(
                        f"    ... and {len(uploaded_files) - MAX_LISTED_FILES} more "
                        f"(full list in the run summary JSON)"
                    )
    else:
        lines.append(
            "No run summary was written to S3 - the collector likely failed "
            "before completing. See the logs below."
        )

    lines += [
        "",
        f"Full run summary: s3://{BUCKET}/sync-runs/{run_id}/run_summary.json",
        f"Collector logs: {_log_group_console_url(COLLECTOR_LOG_GROUP)}",
        f"Pipeline execution: {_execution_console_url(execution_arn)}",
    ]
    return lines


def build_email(event, summary):
    """Compose the (subject, body) pair. Kept separate from I/O for testing."""
    status = event["status"]  # "SUCCEEDED" or "FAILED"
    run_id = event["run_id"]
    execution_arn = event["execution_arn"]
    failed_stage = event.get("failed_stage")
    error = event.get("error")

    stages = (summary or {}).get("stages") or {}
    sessions = _group_sessions(_uploaded_keys(stages))
    added = _total(stages, "uploaded")

    run_dt = _run_datetime(run_id)
    when = (
        f"{run_dt:%A, %B} {run_dt.day}, {run_dt.year} at {run_dt:%H:%M} UTC"
        if run_dt
        else run_id
    )

    lines = [
        "ABE CONTENT INGESTION",
        when,
        "",
        _headline(status, failed_stage, added, _total(stages, "failed")),
        "",
    ]
    if status != "SUCCEEDED":
        lines += _what_this_means(failed_stage)
    lines += _whats_new_lines(sessions, added, status)
    if stages:
        lines += _big_picture_lines(stages, added, summary, status)
        lines += _sources_lines(stages)
        lines += _skip_lines(stages)
    lines += _technical_lines(summary, run_id, execution_arn, failed_stage, error)

    if status == "SUCCEEDED":
        if added:
            item = "item" if added == 1 else "items"
            subject = f"ABE content ingestion: {added} new {item} added"
        else:
            subject = "ABE content ingestion: no new content"
    elif failed_stage == "ingestion":
        subject = "ABE content ingestion FAILED - new content not searchable yet"
    else:
        subject = "ABE content ingestion FAILED - no new content added"
    if run_dt:
        subject = f"{subject} - {run_dt:%b} {run_dt.day}"
    # SNS subjects must be ASCII and under 100 chars
    subject = subject.encode("ascii", errors="ignore").decode().strip()[:100]

    return subject, "\n".join(lines)


def handler(event, context):
    summary = _load_run_summary(event["run_id"])
    subject, body = build_email(event, summary)
    sns.publish(TopicArn=SNS_TOPIC_ARN, Subject=subject, Message=body)
    return {"published": True, "status": event["status"]}
