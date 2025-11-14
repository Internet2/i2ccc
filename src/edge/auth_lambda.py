import json
import os
import hashlib
import hmac
from datetime import datetime, timedelta
from urllib.parse import parse_qs

# Get password from environment variable
AUTH_PASSWORD = os.environ.get('AUTH_PASSWORD', '')
SECRET_KEY = os.environ.get('SECRET_KEY', 'default-secret-key-change-me')

def generate_auth_token(password):
    """Generate an auth token based on password and current timestamp"""
    timestamp = datetime.utcnow().isoformat()
    message = f"{password}:{timestamp}"
    token = hmac.new(
        SECRET_KEY.encode(),
        message.encode(),
        hashlib.sha256
    ).hexdigest()
    return f"{token}:{timestamp}"

def validate_auth_token(token):
    """Validate auth token and check expiration (24 hours)"""
    try:
        token_hash, timestamp_str = token.split(':', 1)
        timestamp = datetime.fromisoformat(timestamp_str)

        # Check if token is expired (24 hours)
        if datetime.utcnow() - timestamp > timedelta(hours=24):
            return False

        # Recreate the message and verify the hash
        message = f"{AUTH_PASSWORD}:{timestamp_str}"
        expected_hash = hmac.new(
            SECRET_KEY.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()

        return hmac.compare_digest(token_hash, expected_hash)
    except Exception:
        return False

def get_cookie_value(headers, cookie_name):
    """Extract cookie value from CloudFront headers"""
    cookie_header = headers.get('cookie', [])
    if not cookie_header:
        return None

    cookies_str = cookie_header[0].get('value', '')
    cookies = {}
    for cookie in cookies_str.split(';'):
        cookie = cookie.strip()
        if '=' in cookie:
            key, value = cookie.split('=', 1)
            cookies[key] = value

    return cookies.get(cookie_name)

def create_redirect_response(location):
    """Create a 302 redirect response"""
    return {
        'status': '302',
        'statusDescription': 'Found',
        'headers': {
            'location': [{
                'key': 'Location',
                'value': location
            }],
            'cache-control': [{
                'key': 'Cache-Control',
                'value': 'no-cache, no-store, must-revalidate'
            }]
        }
    }

def create_auth_cookie_response():
    """Create response that sets auth cookie with success message"""
    auth_token = generate_auth_token(AUTH_PASSWORD)
    # Remove HttpOnly so JavaScript can read the cookie for auth checks in App.tsx
    cookie_value = f"auth-session={auth_token}; Secure; SameSite=None; Max-Age=86400; Path=/"

    return {
        'status': '200',
        'statusDescription': 'OK',
        'headers': {
            'content-type': [{
                'key': 'Content-Type',
                'value': 'application/json'
            }],
            'set-cookie': [{
                'key': 'Set-Cookie',
                'value': cookie_value
            }],
            'cache-control': [{
                'key': 'Cache-Control',
                'value': 'no-cache, no-store, must-revalidate'
            }]
        },
        'body': json.dumps({'success': True, 'message': 'Authentication successful'})
    }

def create_unauthorized_response():
    """Create 401 Unauthorized response with JSON body"""
    return {
        'status': '401',
        'statusDescription': 'Unauthorized',
        'headers': {
            'content-type': [{
                'key': 'Content-Type',
                'value': 'application/json'
            }],
            'cache-control': [{
                'key': 'Cache-Control',
                'value': 'no-cache, no-store, must-revalidate'
            }]
        },
        'body': json.dumps({'error': 'Invalid password'})
    }

def lambda_handler(event, context):
    """
    Lambda@Edge handler for CloudFront viewer request

    Flow:
    1. Check for auth cookie - if valid, allow request
    2. If path is /api/auth and has password header, validate and set cookie
    3. Allow all static assets (JS, CSS, images) through
    4. Allow root path through (React app handles login display)
    5. For authenticated content, validate cookie
    """
    request = event['Records'][0]['cf']['request']
    headers = request['headers']
    uri = request['uri']

    # Allow static assets to pass through (required for React app to load)
    static_extensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.json']
    if any(uri.endswith(ext) for ext in static_extensions):
        return request

    # Allow requests to /assets/ folder
    if uri.startswith('/assets/'):
        return request

    # Check if user is already authenticated
    auth_cookie = get_cookie_value(headers, 'auth-session')
    if auth_cookie and validate_auth_token(auth_cookie):
        # User is authenticated, allow request to proceed
        return request

    # Special handling for authentication API endpoint
    if uri == '/api/auth':
        # Check for password in custom header
        password_header = headers.get('x-auth-password', [])
        if password_header:
            submitted_password = password_header[0].get('value', '')
            if submitted_password == AUTH_PASSWORD:
                # Password is correct, set auth cookie and return success
                return create_auth_cookie_response()
            else:
                # Invalid password
                return create_unauthorized_response()
        else:
            return create_unauthorized_response()

    # Allow root path and index.html (React app will handle showing login page)
    if uri == '/' or uri == '/index.html' or uri == '/login':
        return request

    # This shouldn't be reached, but just in case
    return request
