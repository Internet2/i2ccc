import json
import logging
import os
from typing import Any, Dict

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")

# Guards every feedback write: the target message row must already exist
# (attribute_exists stops update_item from upserting a brand-new row) AND must
# be owned by the caller (stops cross-user tampering). Fails closed on legacy
# rows written before ownership tracking, which have no owner_sub.
_OWNERSHIP_CONDITION = "attribute_exists(session_id) AND owner_sub = :owner"


def save_feedback(
    session_id: str, timestamp: int, rating: str, owner_sub: str, feedback_text: str = ""
) -> None:
    """Save feedback for a message the caller owns."""
    table = dynamodb.Table(os.getenv("CONVERSATION_TABLE"))

    if rating == "thumbs_up":
        # Save thumb feedback and clear any prior thumbs-down reason
        table.update_item(
            Key={
                "session_id": session_id,
                "timestamp": timestamp
            },
            UpdateExpression="SET thumb_rating = :rating REMOVE feedback_text",
            ConditionExpression=_OWNERSHIP_CONDITION,
            ExpressionAttributeValues={
                ":rating": rating,
                ":owner": owner_sub
            }
        )
    elif rating == "thumbs_down":
        if feedback_text:
            # Thumbs-down with a reason — record both
            table.update_item(
                Key={
                    "session_id": session_id,
                    "timestamp": timestamp
                },
                UpdateExpression="SET thumb_rating = :rating, feedback_text = :text",
                ConditionExpression=_OWNERSHIP_CONDITION,
                ExpressionAttributeValues={
                    ":rating": rating,
                    ":text": feedback_text,
                    ":owner": owner_sub
                }
            )
        else:
            # Fresh thumbs-down without a reason yet — clear any stale reason
            table.update_item(
                Key={
                    "session_id": session_id,
                    "timestamp": timestamp
                },
                UpdateExpression="SET thumb_rating = :rating REMOVE feedback_text",
                ConditionExpression=_OWNERSHIP_CONDITION,
                ExpressionAttributeValues={
                    ":rating": rating,
                    ":owner": owner_sub
                }
            )


def feedback_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Handle feedback submission."""
    try:
        body_data: Dict[str, Any] = json.loads(event["body"])
        session_id: str = body_data["session_id"]
        timestamp: int = body_data["timestamp"]
        rating: str = body_data["rating"]  # "thumbs_up" or "thumbs_down"
        feedback_text: str = body_data.get("feedback_text", "")

        # Identity is injected by the authenticated proxy from the validated JWT.
        owner_sub: str = body_data.get("owner_sub")
        if not owner_sub:
            return {
                "statusCode": 401,
                "body": json.dumps("Unauthorized")
            }

        save_feedback(session_id, timestamp, rating, owner_sub, feedback_text)

        return {
            "statusCode": 200,
            "body": json.dumps({"message": "Feedback saved"})
        }

    except ClientError as e:
        # ConditionExpression failed: the row doesn't exist or isn't the caller's.
        if e.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return {
                "statusCode": 403,
                "body": json.dumps("Forbidden")
            }
        logger.error(f"Error in feedback_handler: {e}")
        return {
            "statusCode": 500,
            "body": json.dumps("Error saving feedback")
        }

    except Exception as e:
        logger.error(f"Error in feedback_handler: {e}")
        return {
            "statusCode": 500,
            "body": json.dumps("Error saving feedback")
        }
