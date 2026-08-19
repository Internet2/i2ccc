"""
Bedrock model lifecycle monitor for ABE.

Runs Mondays at 8:00 AM Eastern (EventBridge Scheduler). Each run:

  1. resolves every configured model to its underlying foundation model
     id(s) - bare ids and foundation-model ARNs go straight to
     GetFoundationModel; inference-profile ARNs are resolved first via
     GetInferenceProfile.
  2. reads modelLifecycle.status for each (ACTIVE / LEGACY / ...; missing
     means the model doesn't publish lifecycle data, e.g. some Marketplace
     models - treated as UNKNOWN rather than a hard failure).
  3. diffs against the last-seen status map in SSM Parameter Store.
  4. on the very first run there is nothing to diff against, so the current
     map is just stored as the baseline - otherwise every model would read
     as "changed" (unknown -> ACTIVE) on day one, which is noise, not signal.
  5. any other run: publishes one SNS message per model whose status
     changed, then stores the new map.

The API never returns the actual Legacy/EOL calendar dates (AWS only
publishes those on the model-lifecycle docs page), so alerts link there for
a human to check exact dates rather than guessing.
"""
import json
import os

import boto3

bedrock = boto3.client("bedrock")
ssm = boto3.client("ssm")
sns = boto3.client("sns")

SNS_TOPIC_ARN = os.environ["SNS_TOPIC_ARN"]
STATUS_PARAM = os.environ["STATUS_PARAM"]
REGION = os.environ["AWS_REGION"]

MODELS = {
    "chat": os.environ["CHAT_MODEL_ID"],
    "embedding": os.environ["EMBEDDING_MODEL_ID"],
    "video_ingest": os.environ["VIDEO_TEXT_MODEL_ID"],
    "classifier": os.environ["CLASSIFIER_MODEL_ID"],
    "document_filter": os.environ["DOCUMENT_FILTER_MODEL_ID"],
}

DOCS_URL = "https://docs.aws.amazon.com/bedrock/latest/userguide/model-lifecycle.html"


def _resolve_foundation_model_id(identifier):
    """Bare model ids and foundation-model ARNs go straight through;
    inference-profile ARNs resolve to an underlying foundation model ARN
    first, since GetFoundationModel rejects inference-profile ARNs.

    A profile's models[] list mixes a region-less ARN (arn:...bedrock:::...)
    with one qualified for each supported region - GetFoundationModel
    rejects an ARN whose region doesn't match the client's, so the
    region-qualified entry has to be picked explicitly rather than just
    taking models[0]."""
    if ":inference-profile/" not in identifier:
        return identifier
    profile = bedrock.get_inference_profile(inferenceProfileIdentifier=identifier)
    model_arns = [model["modelArn"] for model in profile["models"]]
    for arn in model_arns:
        if f":{REGION}::" in arn:
            return arn
    return model_arns[0]


def _lifecycle_status(model_identifier):
    details = bedrock.get_foundation_model(modelIdentifier=model_identifier)[
        "modelDetails"
    ]
    return details.get("modelLifecycle", {}).get("status", "UNKNOWN")


def check_all():
    statuses = {}
    for key, identifier in MODELS.items():
        foundation_id = _resolve_foundation_model_id(identifier)
        statuses[key] = _lifecycle_status(foundation_id)
    return statuses


def load_last_statuses():
    try:
        value = ssm.get_parameter(Name=STATUS_PARAM)["Parameter"]["Value"]
        return json.loads(value)
    except ssm.exceptions.ParameterNotFound:
        return {}
    except (ValueError, TypeError) as e:
        # A corrupt status map would silently hide a real status change, so
        # fail loudly instead of treating it as "nothing stored yet"
        raise RuntimeError(f"Could not read status map {STATUS_PARAM}: {e}") from e


def save_statuses(statuses):
    ssm.put_parameter(
        Name=STATUS_PARAM,
        Value=json.dumps(statuses),
        Type="String",
        Overwrite=True,
        Description="Last-seen Bedrock modelLifecycle.status per config.yaml model key",
    )


# What each status means for someone deciding whether action is needed, and
# whether config.yaml has to change before an exact date even shows up.
# LEGACY's minimum is documented by AWS (see DOCS_URL) - not observed via
# API - so it reads as a lower bound, not a guess.
_STATUS_MEANINGS = {
    "LEGACY": (
        "AWS keeps a model in LEGACY for at least 6 months before fully "
        "retiring it (EOL), but the exact retirement date is only on the "
        "docs page below, not in the API. Plan to move this config.yaml "
        "key to a newer model before then."
    ),
    "EOL": (
        "This model has reached end-of-life. Bedrock may already be "
        "rejecting requests to it - config.yaml needs a replacement model "
        "for this key now, not just eventually."
    ),
    "ACTIVE": (
        "This model is back on standard support - no action needed."
    ),
}
_DEFAULT_MEANING = (
    "Bedrock reported this status without a recognized meaning here - "
    "check the docs page below."
)


def _publish_change(config_key, model_id, old_status, new_status):
    subject = f"ABE model lifecycle: {config_key} is now {new_status}"[:100]
    meaning = _STATUS_MEANINGS.get(new_status, _DEFAULT_MEANING)
    body = (
        f"You're getting this email because the \"{config_key}\" model ABE "
        f"uses just changed Bedrock lifecycle status: {old_status} -> {new_status}.\n\n"
        f"{meaning}\n\n"
        f"config.yaml model key: {config_key}\n"
        f"Model: {model_id}\n\n"
        "The Bedrock API does not report exact Legacy/EOL calendar dates - "
        "check the docs page for those:\n"
        f"{DOCS_URL}"
    )
    sns.publish(TopicArn=SNS_TOPIC_ARN, Subject=subject, Message=body)


def handler(event, context):
    current = check_all()
    last = load_last_statuses()

    if not last:
        save_statuses(current)
        return {"initialized": True, "statuses": current}

    changed = {
        key: (last.get(key), status)
        for key, status in current.items()
        if last.get(key) != status
    }
    for key, (old_status, new_status) in changed.items():
        _publish_change(key, MODELS[key], old_status, new_status)
    save_statuses(current)
    return {"changed": list(changed.keys()), "statuses": current}
