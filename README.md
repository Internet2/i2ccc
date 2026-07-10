# Abe — Internet2 Cloud Community Assistant

Abe (**A**nswers **B**y **E**xperts) is a serverless RAG chatbot built for the research and education community by the research and education community (CalPoly, Internet2, and AWS). It answers questions from a curated knowledge base of webinar recordings, Confluence pages, and supporting documents from years of and hundreds of hours of presentations on cloud topics by research and education professionals. This repository (`i2ccc`) contains the full stack: ingestion pipeline, RAG backend, React frontend, and AWS CDK infrastructure.

[![Watch the conference talk — project background and live demo](https://img.youtube.com/vi/Ct1JDdvBuJs/hqdefault.jpg)](https://youtu.be/Ct1JDdvBuJs)

*Conference talk — project background and a live demo of Abe.*

> **Scope.** Abe's knowledge base is drawn from **NET+ AWS**, **NET+ GCP**, **CICP**, and the **CCCG**. Redeploying against the same content offers no benefit; the code is published so your institutions can adapt parts of the architecture to similar use cases.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Deployment](#deployment)
- [Document Ingestion](#document-ingestion)
- [Operations](#operations)
- [Optional Features](#optional-features)
- [License & Attribution](#license--attribution)

## Overview

- **Retrieval-augmented answers.** Questions are routed through a query classifier, vector-searched against an OpenSearch Serverless index, optionally filtered to a specific cloud platform (AWS / GCP / Azure), and answered by an LLM with inline citations to source documents.
- **Conversation memory.** Multi-turn history is persisted per session in DynamoDB with configurable turn and character limits.
- **Source attribution.** Every cited claim links back to the source document in the response UI.
- **Feedback capture.** Thumbs up/down ratings and free-text feedback are written to DynamoDB for review.
- **SSO-ready.** Optional Cognito + SAML federation gates the frontend behind an institutional IdP.

## Architecture

All infrastructure is defined with AWS CDK (Python) in [cdk/](cdk/) and deployed as a single stack.

**Frontend** — React + TypeScript SPA built with Vite, hosted in S3 behind CloudFront with an Origin Access Identity. WAF protects the distribution with the AWS managed common ruleset, SQL injection ruleset, and per-IP rate limiting. An optional ACM certificate enables a custom domain.

**Auth (optional)** — Cognito User Pool federated to a SAML IdP. The frontend uses the Authorization Code flow against the Cognito hosted UI; tokens are validated in the proxy Lambda.

**API** — Two API Gateway endpoints:
- A **proxy** Lambda fronts the chat API, validates Cognito tokens (when SAML is enabled), and injects the upstream API key from SSM Parameter Store so secrets never reach the browser.
- A **RAG** Lambda performs classification, retrieval, filtering, and generation against Bedrock.

**Retrieval & generation** — Bedrock models (configurable in `config.yaml`):
- Chat: `moonshotai.kimi-k2.5`
- Classification & document filtering: `anthropic.claude-3-haiku-20240307-v1:0`
- Embeddings: `amazon.titan-embed-text-v2:0`

OpenSearch Serverless holds the vector index. Step Functions orchestrate ingestion with configurable concurrency.

**Storage** — S3 for raw documents and the frontend bundle; DynamoDB for processed-file tracking, conversation history, and feedback; SSM Parameter Store for prompts and API keys.

## Prerequisites

- AWS account with credentials configured and `us-east-1` available (required for CloudFront / Lambda@Edge / WAF scope).
- Bootstrapped CDK environment (`cdk bootstrap`).
- Python 3.11+, Node.js 18+, [pnpm](https://pnpm.io/installation), Docker running locally (CDK uses it to bundle Lambda dependencies).
- Bedrock model access in the deploy region for the models listed above (Console → Bedrock → Model access).

## Deployment

### 1. Clone and install

```bash
git clone https://github.com/Internet2/i2ccc.git
cd i2ccc
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp config.yaml.example config.yaml
```

### 2. Deploy infrastructure

`config.yaml` ships with sensible defaults — you only need to fill in real values after the first deploy. The initial `cdk deploy` will succeed with placeholders for any field the stack itself produces (OpenSearch endpoint, API endpoints, table names).

```bash
cdk deploy
```

### 3. Populate `config.yaml` from stack outputs

The deploy prints a set of `CfnOutput` values. Map them into `config.yaml`:

| CDK output | `config.yaml` key |
| --- | --- |
| `OpensearchAPIEndpoint` | `opensearch_endpoint` |
| `RagApiEndpoint` | `rag_api_endpoint` |
| `ProxyAPIEndpoint` | `proxy_api_endpoint` |
| `FrontendBucketName` | (used by `deploy-frontend.sh`) |
| `DistributionId` | (used by `deploy-frontend.sh`) |
| `CloudFrontURL` / `CustomDomainURL` | frontend URL |

Also set `api_key` (API Gateway → API Keys → reveal), `step_function_arn`, `processed_files_table`, and `s3_bucket_name`.

A second `cdk deploy` is not required unless you change infrastructure-affecting fields (prompts, models, auth, custom domain, etc.).

### 4. Deploy the frontend

```bash
cd frontend
cp .env.example .env
# Set VITE_API_ENDPOINT to the ProxyAPIEndpoint from CDK output
```

From the repository root:

```bash
./scripts/deploy-frontend.sh
```

The script reads CDK outputs, builds the Vite bundle, syncs to S3 with cache headers tuned per asset type, and invalidates the CloudFront cache.

## Document Ingestion

The pipeline accepts files dropped into `s3://<bucket>/files-to-process/` and is driven by a Step Functions state machine. Ingestion is idempotent: processed files are tracked in DynamoDB and re-runs skip them unless the cache is reset.

### Option A — direct S3 upload

```bash
aws s3 cp ./documents/ s3://<bucket>/files-to-process/ --recursive
```

### Option B — Confluence + Google Drive scraper

Use this when source material lives in a Confluence space with linked Google Drive folders.

1. **Atlassian API token** — create one at <https://id.atlassian.com/manage-profile/security/api-tokens>.
2. **Google service account** — in the Google Cloud Console, enable the Google Drive API, create a service account, download a JSON key. Share the target Drive folders with the service account email (Viewer access).
3. **LibreOffice** — required for converting Office files during ingestion:
   ```bash
   brew install --cask libreoffice          # macOS
   sudo apt-get install libreoffice         # Debian/Ubuntu
   ```
4. **Environment** — in [ingest_utils/confluence_processor/](ingest_utils/confluence_processor/):
   ```bash
   cp names.env.copy names.env
   # Fill in GOOGLE_DRIVE_CREDENTIALS, GOOGLE_API_KEY, CONFLUENCE_API, SERVICE_ACC_SECRET_NAME
   source names.env
   ```
   Add the Confluence URLs to `confluence_urls:` in `config.yaml`.
5. **Run**:
   ```bash
   python confluence_processor.py                       # scrape asset links → CSV
   python google_drive_processor.py                     # pull files from Drive → S3
   python confluence_event_descriptions_to_s3.py        # pull page descriptions → S3
   ```

### Start processing

```bash
cd ingest_utils
python run_step_function.py                  # creates the OpenSearch index if missing, then runs the state machine
python run_step_function.py --reset-cache    # forget previously-processed files and reprocess everything
```

## Operations

### Check ingestion progress

```bash
./scripts/check_processing_status.sh
```

Reports files in DynamoDB, recently processed files, files in S3, and the remaining backlog.

### Test the chatbot

Use the production frontend — the CloudFront or custom-domain URL.

Response quality improves as more documents finish ingestion; partial answers are expected during the initial run.

## Optional Features

These are gated by `config.yaml` flags and are inactive by default.

### Cognito SAML SSO

Federate the frontend with an institutional SAML IdP:

```yaml
enable_saml_auth: true
cognito_domain_prefix: chatbot-yourorg          # globally unique
saml_idp_name: CorporateSSO
saml_idp_metadata_url: https://idp.example.edu/metadata
saml_attribute_mapping:
  email: http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress
  given_name: http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname
  family_name: http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname
```

After `cdk deploy`, share the `SAMLAcsUrl`, `SAMLEntityId`, and `SPMetadataUrl` outputs with your IAM team so they can register the app as a SAML Service Provider.

### Custom CloudFront domain

Both fields must be set together; the ACM certificate must be in `us-east-1`:

```yaml
frontend_domain_name: chatbot.example.edu
frontend_certificate_arn: arn:aws:acm:us-east-1:<account>:certificate/<id>
```

## License & Attribution

Released under the [MIT License](LICENSE).

This project began as a fork of an AWS / Cal Poly DxHub [DxHub Innovation Challenge](https://dxhub.calpoly.edu/challenges/) prototype and has since been rewritten and extended by Internet2.
