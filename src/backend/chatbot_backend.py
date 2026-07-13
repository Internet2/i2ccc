import json
import logging
import os
import re
import time
import uuid
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

import boto3
from boto3.dynamodb.conditions import Key
from opensearch_query import generate_short_uuid, get_documents
from search_utils import generate_text_embedding

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")
ssm = boto3.client("ssm")

# Reject oversized queries before any billable Bedrock/OpenSearch call
MAX_QUERY_CHARS = 4000

# Cache for prompts
_prompt_cache = {}


def get_prompt(param_name: str) -> str:
    """Get prompt from Parameter Store with caching."""
    if param_name not in _prompt_cache:
        response = ssm.get_parameter(Name=param_name)
        _prompt_cache[param_name] = response["Parameter"]["Value"]
    return _prompt_cache[param_name]


def get_conversation_history(session_id: str) -> List[Dict[str, str]]:
    """Get conversation history based on config limits."""
    table = dynamodb.Table(os.getenv("CONVERSATION_TABLE"))
    max_turns = int(os.getenv("CONVERSATION_HISTORY_TURNS", "4"))

    response = table.query(
        KeyConditionExpression=Key("session_id").eq(session_id),
        ScanIndexForward=False,
        Limit=max_turns * 2,  # Get turns * 2 to have user + assistant pairs
    )

    messages = []
    for item in response["Items"]:
        messages.append({"role": item["role"], "content": item["content"]})

    # Return last messages (reverse to chronological order)
    return list(reversed(messages[-max_turns:]))


def get_session_owner(session_id: str) -> Optional[str]:
    """Return the owner_sub of an existing session.

    Returns None if the session has no stored items yet (a brand-new session) or
    predates ownership tracking (legacy rows written before this fix). The oldest
    item is authoritative — it was written by the session's creator.
    """
    table = dynamodb.Table(os.getenv("CONVERSATION_TABLE"))
    response = table.query(
        KeyConditionExpression=Key("session_id").eq(session_id),
        Limit=1,
        ProjectionExpression="owner_sub",
    )
    items = response.get("Items", [])
    if not items:
        return None
    return items[0].get("owner_sub")


def _prepare_for_dynamodb(value: Any) -> Any:
    """Recursively clean a value tree for DynamoDB put_item:
    - drop None values and empty strings (rejected by the high-level Table API)
    - convert floats to Decimal (DynamoDB has no float type)

    Returns a new structure; does not mutate the input.
    """
    if isinstance(value, dict):
        return {
            k: _prepare_for_dynamodb(v)
            for k, v in value.items()
            if v is not None and v != ""
        }
    if isinstance(value, list):
        return [_prepare_for_dynamodb(v) for v in value if v is not None]
    if isinstance(value, float):
        return Decimal(str(value))
    return value


def save_message(
    session_id: str,
    role: str,
    content: str,
    document_ids: List[str] = None,
    conversation_turn: str = None,
    sources: Optional[List[Dict[str, Any]]] = None,
    owner_sub: Optional[str] = None,
) -> int:
    """Save a message to conversation history and return timestamp."""
    table = dynamodb.Table(os.getenv("CONVERSATION_TABLE"))

    timestamp = int(time.time() * 1000)
    item = {
        "session_id": session_id,
        "timestamp": timestamp,
        "role": role,
        "content": content,
    }

    if owner_sub:
        item["owner_sub"] = owner_sub

    if document_ids:
        item["document_ids"] = document_ids

    if conversation_turn:
        item["conversation_turn"] = conversation_turn

    if sources:
        item["sources"] = _prepare_for_dynamodb(sources)

    table.put_item(Item=item)
    return timestamp


def extract_document_ids(documents: List[Dict[str, Any]]) -> List[str]:
    """Extract document IDs from OpenSearch results."""
    doc_ids = []
    for doc in documents:
        if doc.get("_id"):
            doc_ids.append(doc["_id"])
    return doc_ids


def build_conversation_context(
    history: List[Dict[str, str]], current_query: str
) -> str:
    """Build conversation context from history."""
    if not history:
        return current_query

    context_parts = []
    for msg in history:
        if msg["role"] == "user":
            context_parts.append(f"Previous question: {msg['content']}")
        else:
            context_parts.append(f"Previous answer: {msg['content']}")

    context_parts.append(f"Current question: {current_query}")
    return "\n\n".join(context_parts)


def invoke_model(
    prompt: str, model_id: str, max_tokens: int = 4096
) -> Optional[str]:
    """Calls Bedrock for a given model id.

    Args:
        prompt (str): The text prompt to send to the model
        model_id (str): The Bedrock model identifier
        max_tokens (int): Maximum number of tokens to generate

    Returns:
        str: The text response from the model
    """

    bedrock = boto3.client("bedrock-runtime")

    try:
        inference_config = {
            "maxTokens": int(os.environ.get("MAX_TOKENS", "4096")),
            "temperature": float(os.environ.get("TEMPERATURE", "1.0")),
            "topP": float(os.environ.get("TOP_P", "0.999")),
        }
        messages = [{"role": "user", "content": [{"text": prompt}]}]

        logger.info(f"Prompt: {prompt}")
        response = bedrock.converse(
            modelId=model_id,
            messages=messages,
            inferenceConfig=inference_config,
        )

        return response["output"]["message"]["content"][0]["text"]

    except Exception:
        logger.exception("Error invoking the model")
        return None


def classify_platform_question(user_query: str) -> tuple[bool, str]:
    """Classify if question is platform-specific and extract platform using LLM."""
    classifier_prompt = get_prompt("/chatbot/prompts/classifier").format(
        question=user_query
    )
    response = invoke_model(
        classifier_prompt, os.getenv("CLASSIFIER_MODEL_ID"), max_tokens=100
    )

    if response and "<is_platform>True</is_platform>" in response:
        # Extract platform from response
        import re

        platform_match = re.search(r"<platform>(\w+)</platform>", response)
        platform = platform_match.group(1) if platform_match else ""
        return True, platform
    return False, ""


def extract_platform_from_query(user_query: str) -> str:
    """Extract platform name from user query."""
    query_lower = user_query.lower()
    if any(
        term in query_lower for term in ["aws", "amazon web services", "amazon"]
    ):
        return "AWS"
    elif any(term in query_lower for term in ["gcp", "google cloud", "google"]):
        return "GCP"
    elif any(term in query_lower for term in ["azure", "microsoft"]):
        return "Azure"
    return ""


def filter_platform_documents(
    documents: List[Dict[str, Any]], platform: str
) -> List[Dict[str, Any]]:
    """Filter out documents not related to the specified platform."""
    if not platform:
        return documents

    # Extract document titles
    doc_titles = []
    for doc in documents:
        if doc.get("_source", {}).get("metadata", {}).get("doc_id"):
            doc_titles.append(doc["_source"]["metadata"]["doc_id"])

    if not doc_titles:
        return documents

    # Use LLM to filter documents
    filter_prompt = get_prompt("/chatbot/prompts/filter").format(
        platform=platform, document_titles="\n".join(doc_titles)
    )

    response = invoke_model(
        filter_prompt, os.getenv("DOCUMENT_FILTER_MODEL_ID"), max_tokens=1000
    )

    if not response or response.strip() == "NONE":
        return documents

    # Parse filtered titles
    filtered_titles = [
        title.strip() for title in response.split("\n") if title.strip()
    ]
    logger.info(f"Documents filtered out for {platform}: {filtered_titles}")

    # Remove documents with filtered titles
    filtered_docs = []
    for doc in documents:
        doc_title = doc.get("_source", {}).get("metadata", {}).get("doc_id", "")
        if doc_title not in filtered_titles:
            filtered_docs.append(doc)

    return filtered_docs


def process_text(
    text: str,
    uuid_mapping: Dict[str, Dict[str, Any]],
    metadata_mapping: Dict[str, Dict[str, Any]],
) -> Tuple[str, List[Dict[str, Any]]]:
    """Rewrite <uuid> citations to [[n]] tokens and build a structured source list.

    The LLM is instructed to cite using <uuid> tokens (8-hex-char ids generated
    fresh per request). This function rewrites each <uuid> to [[n]] where n is a
    1-indexed reference number assigned in order of first appearance of each
    unique source URL. Repeated citations to the same URL reuse the same n
    (Perplexity-style dedup).

    Unknown UUIDs (LLM hallucinations or format mismatches) are silently stripped
    by the trailing cleanup regex, preserving the existing fail-closed behavior.

    Args:
        text (str): LLM response containing <uuid> tokens.
        uuid_mapping (Dict[str, Dict[str, Any]]): Mapping of UUIDs to source URLs
            Format: {"uuid": {"source_url": "url", ...}}
        metadata_mapping (Dict[str, Dict[str, Any]]): Mapping of UUIDs to metadata
            Format: {"uuid": {"title": str, "doc_type": str, "start_time": str,
                              "member_content_flag": str}}

    Returns:
        Tuple[str, List[Dict[str, Any]]]:
            - text with <uuid> replaced by [[n]] tokens; unknown angle-bracket
              content stripped.
            - ordered list of source dicts with shape:
                {"n": int, "title": str, "url": str,
                 "badge": "public" | "cicp_subscriber_only",
                 "doc_type": str, "start_time": Optional[int]}

    Example:
        >>> text = "Per the Q4 review <ab12cd34>, growth was strong <ab12cd34>."
        >>> uuid_mapping = {"ab12cd34": {"source_url": "example.com",
        ...                              "doc_type": "document"}}
        >>> metadata_mapping = {"ab12cd34": {"title": "Q4 Review",
        ...                                  "doc_type": "document",
        ...                                  "member_content_flag": "false"}}
        >>> process_text(text, uuid_mapping, metadata_mapping)
        ('Per the Q4 review [[1]], growth was strong [[1]].',
         [{'n': 1, 'title': 'Q4 Review', 'url': 'example.com',
           'badge': 'public', 'doc_type': 'document', 'start_time': None}])
    """

    uuid_pattern = r"<([a-f0-9]{8})>"

    url_to_n: Dict[str, int] = {}
    sources: List[Dict[str, Any]] = []

    def replace_uuid(match: re.Match[str]) -> str:
        uuid_match = match.group(1)
        source_data = uuid_mapping.get(uuid_match)
        metadata_info = metadata_mapping.get(uuid_match)

        if not (source_data and metadata_info):
            # Unknown UUID: leave for the cleanup regex below to strip
            return match.group(0)

        source_url = source_data["source_url"]
        doc_type = metadata_info["doc_type"]
        start_time = metadata_info.get("start_time")
        is_member = metadata_info["member_content_flag"]
        title = metadata_info["title"]

        if doc_type in ["video", "podcast"] and start_time:
            url = f"{source_url}#t={start_time}"
        else:
            url = source_url

        n = url_to_n.get(url)
        if n is None:
            n = len(sources) + 1
            url_to_n[url] = n
            sources.append(
                {
                    "n": n,
                    "title": title,
                    "url": url,
                    "badge": "cicp_subscriber_only"
                    if is_member == "true"
                    else "public",
                    "doc_type": doc_type,
                    "start_time": start_time,
                }
            )

        return f"[[{n}]]"

    text = re.sub(uuid_pattern, replace_uuid, text)

    # Strip any remaining angle-bracket content (unknown UUIDs or malformed tokens)
    text = re.sub(r"<[^>]*>", "", text)

    return text, sources


def format_documents_for_llm(
    documents: List[Dict[str, Any]], source_mapping: Dict[str, Dict[str, Any]]
) -> List[Dict[str, str]]:
    """Format documents for LLM to read with only UUID, passage content, and file name."""

    formatted_docs: List[Dict[str, str]] = []

    for i, (doc_uuid, _) in enumerate(source_mapping.items()):
        if i < len(documents) and documents[i].get("_source"):
            document = documents[i]["_source"]
            passage = document.get("passage", "")
            doc_id = document.get("metadata", {}).get("doc_id", "")

            formatted_doc: Dict[str, str] = {
                "uuid": doc_uuid,
                "document_name": doc_id,
                "passage": passage,
            }
            formatted_docs.append(formatted_doc)

    return formatted_docs


def extract_metadata_for_substitution(
    documents: List[Dict[str, Any]], source_mapping: Dict[str, Dict[str, Any]]
) -> Dict[str, Dict[str, Any]]:
    """Extract all metadata that will be substituted back after LLM response."""

    metadata_mapping: Dict[str, Dict[str, Any]] = {}

    # Convert source_mapping to a list to maintain order
    source_items: List[Tuple[str, Dict[str, Any]]] = list(
        source_mapping.items()
    )

    for i, item in enumerate(documents):
        if item.get("_source") and i < len(source_items):
            document = item.get("_source")
            metadata = document.get("metadata", {})
            doc_type = document.get("type", "")

            # Use the UUID at the same index position
            doc_uuid = source_items[i][0]

            # Get title based on document type
            title = metadata.get("doc_id", "Document")

            metadata_info: Dict[str, Any] = {
                "title": title,
                "parent_folder_name": metadata.get("parent-folder-name", ""),
                "parent_folder_url": metadata.get("parent-folder-url", ""),
                "member_content_flag": metadata.get("member-content", ""),
                "doc_type": doc_type,
            }

            # Add start time for video/audio content
            if doc_type in ["video", "podcast"]:
                metadata_info["start_time"] = metadata.get("start_time", 0)

            metadata_mapping[doc_uuid] = metadata_info

    return metadata_mapping


def generate_source_mapping(
    documents: List[Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    """Generates a mapping from uuid to source URL with timestamp info for LLM to read."""

    source_mapping: Dict[str, Dict[str, Any]] = {}
    for item in documents:
        if item.get("_source"):
            document = item.get("_source")
            metadata = document.get("metadata", {})

            source_id = generate_short_uuid()
            source_url = metadata.get("source-url", "")
            doc_type = document.get("type", "")
            member_content = metadata.get("member-content", "")
            title = metadata.get("doc_id", "Document")

            # Store source URL, timestamp info, member content flag, and title
            source_data: Dict[str, Any] = {
                "source_url": source_url,
                "doc_type": doc_type,
                "start_time": metadata.get("start_time", 0)
                if doc_type in ["video", "podcast"]
                else None,
                "member_content": member_content,
                "title": title,
            }

            source_mapping[source_id] = source_data

    return source_mapping


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    try:
        body_data: Dict[str, Any] = json.loads(event["body"])

        # Identity is injected by the authenticated proxy from the validated JWT.
        caller_sub: Optional[str] = body_data.get("owner_sub")
        if not caller_sub:
            return {"statusCode": 401, "body": json.dumps("Unauthorized")}

        # Validate inputs before any billable call (S5/S12).
        user_query = body_data.get("query")
        if (
            not isinstance(user_query, str)
            or not user_query.strip()
            or len(user_query) > MAX_QUERY_CHARS
        ):
            return {"statusCode": 400, "body": json.dumps("Invalid query")}

        session_id = body_data.get("session_id", str(uuid.uuid4()))
        if not isinstance(session_id, str) or not session_id:
            return {"statusCode": 400, "body": json.dumps("Invalid session_id")}

        # IDOR guard: refuse to read or write a session owned by another user.
        existing_owner = get_session_owner(session_id)
        if existing_owner is not None and existing_owner != caller_sub:
            return {"statusCode": 403, "body": json.dumps("Forbidden")}

        # Get conversation history
        history = get_conversation_history(session_id)

        embedding: List[float] = generate_text_embedding(user_query)

        selected_docs: List[Dict[str, Any]] = get_documents(
            user_query, embedding
        )

        # Platform classification and filtering
        is_platform_specific, platform = classify_platform_question(user_query)
        logger.info(
            f"Platform classification - Is platform specific: {is_platform_specific}, Platform: {platform}"
        )

        if is_platform_specific and platform:
            original_count = len(selected_docs)
            selected_docs = filter_platform_documents(selected_docs, platform)
            filtered_count = original_count - len(selected_docs)
            logger.info(
                f"Platform filtering - Removed {filtered_count} documents not related to {platform}"
            )
        else:
            logger.info("No platform filtering applied")

        source_mapping: Dict[str, Dict[str, Any]] = generate_source_mapping(
            selected_docs
        )

        formatted_docs: List[Dict[str, str]] = format_documents_for_llm(
            selected_docs, source_mapping
        )

        # Extract metadata separately for post-processing
        metadata_mapping: Dict[str, Dict[str, Any]] = (
            extract_metadata_for_substitution(selected_docs, source_mapping)
        )

        # Create simplified mapping for LLM prompt (only UUIDs and source URLs)
        simplified_mapping: Dict[str, str] = {}
        for uuid_key, data in source_mapping.items():
            simplified_mapping[uuid_key] = data["source_url"]

        # Include conversation history in prompt
        history_context = ""
        if history:
            max_chars = int(os.getenv("MAX_HISTORY_CHARACTERS", "100000"))
            max_turns = int(os.getenv("CONVERSATION_HISTORY_TURNS", "4"))

            history_context += "<conversation_history>"
            current_length = 0

            for msg in history[-max_turns:]:
                msg_text = f"{msg['role'].title()}: {msg['content']}\n"
                if current_length + len(msg_text) > max_chars:
                    break
                history_context += msg_text
                current_length += len(msg_text)

            history_context += "\n"
            history_context += "</conversation_history>"

        prompt: str = (
            history_context
            + "User: "
            + user_query
            + "\n"
            + get_prompt("/chatbot/prompts/chat").format(
                documents=formatted_docs, citations=str(simplified_mapping)
            )
        )

        logger.info(f"User query length: {len(user_query)}")
        logger.info(f"Formatted documents length: {len(str(formatted_docs))}")
        logger.info(f"Prompt length: {len(prompt)}")

        model_response: Optional[str] = invoke_model(
            prompt, os.getenv("CHAT_MODEL_ID")
        )

        logger.info(f"Model: {model_response}")

        # Replace <uuid> tokens with [[n]] numbered citations and collect sources.
        final_response, sources = process_text(
            model_response, source_mapping, metadata_mapping
        )

        # Extract document IDs for storage
        document_ids = extract_document_ids(selected_docs)

        # Generate conversation turn ID to link Q&A pair
        conversation_turn = str(uuid.uuid4())

        # Save conversation to history
        save_message(
            session_id,
            "user",
            user_query,
            None,
            conversation_turn,
            owner_sub=caller_sub,
        )
        assistant_timestamp = save_message(
            session_id,
            "assistant",
            final_response,
            document_ids,
            conversation_turn,
            sources=sources,
            owner_sub=caller_sub,
        )

        return {
            "statusCode": 200,
            "body": json.dumps(
                {
                    "response": final_response,
                    "session_id": session_id,
                    "timestamp": assistant_timestamp,
                    "sources": sources,
                }
            ),
        }

    except Exception:
        logger.exception("Error in lambda_handler")
        return {
            "statusCode": 500,
            "body": json.dumps("Error processing message"),
        }
