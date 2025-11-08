# Internet2 Chatbot

This repository contains an enhanced and internally maintained version of a RAG-based chatbot solution, originally developed by the Cal Poly DxHub team and AWS.

## Table of Contents
- [Overview](#chatbot-overview)
- [Key Features & Enhancements](#key-features--enhancements)
- [Deployment Steps](#deployment-steps)
- [Attribution](#attribution)

## Chatbot Overview

A serverless RAG (Retrieval Augmented Generation) chatbot that answers questions using your knowledge base articles with:

#### Intelligent Question Answering
- Leverages Retrieval Augmented Generation (RAG) for accurate and contextual responses
- Dynamic context integration for more relevant and precise answers
- Real-time information retrieval

#### Source Attribution
- Direct links to source documents
- Easy access to reference materials

#### Scalability and Versatility
- Serverless architecture enables automatic scaling
- API-first design supports multiple frontend implementations

#### User Feedback
- Thumbs up/down rating system
- Text feedback collection for response improvement

## Key Features & Enhancements

This version includes several enhancements beyond the original implementation:

- **S3 Upload Utilities**: Added `s3_uploader.py` and `upload_local_files.py` for easier file management and batch uploads
- **Environment Template**: Added `names.env.copy` template for easier environment configuration
- **User Feedback System**: Implemented feedback collection with thumbs up/down and text comments
- **Enhanced Confluence Processing**: Support for multiple Confluence URLs and skip existing S3 files to avoid reprocessing
- **Conversation History**: Added configurable conversation history tracking and turn limits
- **Query Classification**: Added query classifier with logging for better monitoring
- **Advanced Configuration**: Extended `config.yaml` with temperature, top_p, max_tokens, docs_retrieved, and falloff parameters
- **Improved Prompts**: Multiple prompt refinements for better response quality

## Deployment Steps

### Prerequisites
- AWS CDK CLI, Docker (running), Python 3.x, Git, a CDK Bootstrapped environment
- AWS credentials configured

### Step 1: Clone & Setup
```bash
git clone https://github.com/cal-poly-dxhub/internet2-chatbot.git
cd internet2-chatbot
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
mv example_config.yaml config.yaml
```

### Step 2: Request Bedrock Model Access
In AWS Bedrock console → Model access, request access for:
- `anthropic.claude-3-5-sonnet-20241022-v2:0`
- `amazon.titan-embed-text-v2:0`
- `anthropic.claude-3-haiku-20240307-v1:0`

### Step 3: Deploy Infrastructure
```bash
cdk deploy
```

### Step 4: Update config.yaml
Update with CDK outputs:
```yaml
opensearch_endpoint: <FROM_CDK_OUTPUT>
rag_api_endpoint: <FROM_CDK_OUTPUT>
s3_bucket_name: <FROM_CDK_OUTPUT>
step_function_arn: <FROM_CDK_OUTPUT>
processed_files_table: <FROM_CDK_OUTPUT>
api_key: <FROM_API_GATEWAY_CONSOLE>
```

### Step 5: Upload Documents & Run Processing

#### Option A: Manual File Upload
```bash
# Upload files to S3
aws s3 cp your-documents/ s3://<S3_BUCKET_NAME>/files-to-process/ --recursive
```

#### Option B: Google Drive Integration
**Prerequisites**: Google Cloud account, Atlassian account, LibreOffice installed

**1. Set Up Atlassian API Access:**
- Go to https://id.atlassian.com/manage-profile/security/api-tokens
- Click "Create API token", label it, and copy the token
- Save this token for later use

**2. Set Up Google Service Account:**
- Go to [Google Cloud Console](https://console.cloud.google.com/)
- Create a new project (or use existing)
- Go to "APIs & Services" > "Library" and enable "Google Drive API"
- Go to "APIs & Services" > "Credentials"
- Click "Create Credentials" > "Service account"
- Give it a name and click "Create and Continue" > "Done"
- Click your new service account > "Keys" tab > "Add Key" > "Create new key" > "JSON"
- Download and save the JSON file (CRITICAL: Make sure the downloaded file is in a valid .json format)

**3. Share Google Drive Access:**
- Open Google Drive and right-click folders/files you want to ingest
- Click "Share" and add the service account email (from JSON file: `xxxx@xxxx.iam.gserviceaccount.com`)
- Set as "Viewer" and click "Send"

**4. Install LibreOffice:**
```bash
# macOS
brew install --cask libreoffice

# Ubuntu/Debian
sudo apt-get install libreoffice
```

**5. Configure Environment:**
```bash
# Go into the code directory
cd ingest_utils/confluence_processor

# Copy the template and configure your environment variables
cp names.env.copy names.env

# Edit names.env and set these variables:
SERVICE_ACC_SECRET_NAME=default-service-account-name
GOOGLE_DRIVE_CREDENTIALS=/path/to/your/service-account.json
GOOGLE_API_KEY=your-google-api-key
CONFLUENCE_API=your_atlassian_api_token_from_step_1

# Load environment variables
source names.env

# Set these variables in config.yaml and check for any missing fields
CONFLUENCE_URL=your-confleunce-url-to-scrape
```

**6. Run Ingestion:**
```bash
# Scrape asset links from Confluence wiki (creates a .csv file with links to folders)
python confluence_processor.py

# Download from Google Drive and upload to S3
python google_drive_processor.py

# Download .txt files from the wiki page descriptions section and upload to S3
python confluence_event_descriptions_to_s3.py
```

### Step 6: Run Document Processing
```bash
# Make sure you are in the ingest_utils directory
cd ingest_utils
python run_step_function.py
```
This automatically creates the OpenSearch index if needed, then starts document processing.

**Note:** Files set for processing are saved to DynamoDB to ensure there are no lost updates due to concurrent operations. To reset this cache run:

```bash
python run_step_function.py --reset-cache
```

### Step 7: Test (Can Start Immediately)
Command line interface:
```bash
python chat_test.py
```

OR

Web interface:
```bash
streamlit run chat_frontend.py
```
**Note**: You can start testing immediately after Step 6, but response quality will improve as more documents are processed. Wait for full ingestion completion for best results.

## Troubleshooting
- **Docker access**: `sudo usermod -aG docker $USER && newgrp docker`
- **CDK issues**: Check `aws sts get-caller-identity` and run `cdk bootstrap`
- **Model access**: Verify in Bedrock console
- **Processing fails**: Check Step Function logs in AWS Console
- **Chat issues**: Verify API key and endpoint accessibility

## Known Issues
- Quick PoC with no intent verification or error checking

## Attribution

This repository is based on the original chatbot solution developed by the Cal Poly DxHub team and AWS as part of the [DxHub Innovation Challenges](https://dxhub.calpoly.edu/challenges/).

**Original Development Team:**
- Darren Kraker, Sr Solutions Architect - dkraker@amazon.com
- Nick Riley, Jr SDE - njriley@calpoly.edu
- Kartik Malunjkar, Software Development Engineer Intern - kmalunjk@calpoly.edu

### Original Project Disclaimers

The original AWS prototype included the following disclaimers:

**This code:**
- (a) is provided as-is and without warranties
- (b) is not suitable for production environments without additional hardening
- (c) includes shortcuts for rapid prototyping such as relaxed authentication and authorization
- (d) does not represent AWS product offerings, practices, or recommendations

**Note:** This fork is independently maintained and is not affiliated with, endorsed by, or supported by AWS or Cal Poly DxHub.
