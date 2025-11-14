"""
Proxy Lambda Function
This function acts as a secure proxy between the frontend and the backend API.
It retrieves the API key from SSM Parameter Store and forwards requests securely.
"""

import json
import os
import boto3
import urllib3
from typing import Any, Dict

# Initialize clients
ssm = boto3.client('ssm')
http = urllib3.PoolManager()

# Cache for API key (reused across warm Lambda invocations)
_api_key_cache = None


def get_api_key() -> str:
    """Retrieve API key from SSM Parameter Store with caching."""
    global _api_key_cache

    if _api_key_cache is not None:
        return _api_key_cache

    parameter_name = os.environ['API_KEY_PARAMETER_NAME']

    try:
        response = ssm.get_parameter(
            Name=parameter_name,
            WithDecryption=True
        )
        _api_key_cache = response['Parameter']['Value']
        return _api_key_cache
    except Exception as e:
        print(f"Error retrieving API key from SSM: {e}")
        raise


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Proxy handler that forwards requests to the backend API with API key.
    """
    print(f"Received event: {json.dumps(event)}")

    # Get configuration from environment
    backend_api_url = os.environ['BACKEND_API_URL']

    # Get the API key from SSM
    try:
        api_key = get_api_key()
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            'body': json.dumps({
                'error': 'Failed to retrieve API credentials'
            })
        }

    # Handle OPTIONS request for CORS preflight
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            'body': ''
        }

    # Get the path to determine which backend endpoint to call
    path = event.get('path', '').replace('/api', '')

    # Construct the full backend URL
    full_url = f"{backend_api_url.rstrip('/')}{path}"

    # Parse the request body
    try:
        body = event.get('body', '{}')
        if isinstance(body, str):
            request_data = json.loads(body) if body else {}
        else:
            request_data = body
    except json.JSONDecodeError as e:
        return {
            'statusCode': 400,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'error': 'Invalid JSON in request body'
            })
        }

    # Forward the request to the backend API with the API key
    try:
        print(f"Forwarding request to: {full_url}")

        response = http.request(
            'POST',
            full_url,
            body=json.dumps(request_data).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'x-api-key': api_key
            },
            timeout=60.0
        )

        # Parse the response
        response_body = response.data.decode('utf-8')

        # Return the response to the frontend
        return {
            'statusCode': response.status,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            'body': response_body
        }

    except Exception as e:
        print(f"Error forwarding request: {e}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'error': 'Failed to process request',
                'details': str(e)
            })
        }
