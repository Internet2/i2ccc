#!/bin/bash

# Frontend Deployment Script for S3 + CloudFront
# This script builds the React frontend and deploys it to S3 and CloudFront

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Frontend Deployment Script${NC}"
echo -e "${GREEN}========================================${NC}"

# Get the script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
CDK_DIR="$PROJECT_ROOT/cdk"

# Check if frontend directory exists
if [ ! -d "$FRONTEND_DIR" ]; then
    echo -e "${RED}Error: Frontend directory not found at $FRONTEND_DIR${NC}"
    exit 1
fi

# Step 1: Get CDK outputs
echo -e "\n${YELLOW}Step 1: Getting CDK outputs...${NC}"

# Get stack name from cdk.json or use default
STACK_NAME=$(cat "$PROJECT_ROOT/cdk.json" | grep -o '"RagChatbotStack[^"]*"' | head -1 | tr -d '"' 2>/dev/null || echo "RagChatbotStack")
if [ -z "$STACK_NAME" ]; then
    STACK_NAME="RagChatbotStack"
fi

echo "Using stack name: $STACK_NAME"

# Get S3 bucket name from CDK outputs (pattern match to handle CDK-generated suffixes)
BUCKET_NAME=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?contains(OutputKey, 'FrontendBucketName')].OutputValue" \
    --output text)

# Get CloudFront distribution ID from CDK outputs
DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?contains(OutputKey, 'DistributionId')].OutputValue" \
    --output text)

# Get CloudFront URL from CDK outputs
CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?contains(OutputKey, 'CloudFrontURL')].OutputValue" \
    --output text)

if [ -z "$BUCKET_NAME" ] || [ -z "$DISTRIBUTION_ID" ]; then
    echo -e "${RED}Error: Could not retrieve CDK outputs. Make sure the stack is deployed.${NC}"
    echo -e "${YELLOW}Run 'cd cdk && cdk deploy' first to create the infrastructure.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ S3 Bucket: $BUCKET_NAME${NC}"
echo -e "${GREEN}✓ CloudFront Distribution: $DISTRIBUTION_ID${NC}"
echo -e "${GREEN}✓ CloudFront URL: $CLOUDFRONT_URL${NC}"

# Step 2: Build the frontend
echo -e "\n${YELLOW}Step 2: Building frontend...${NC}"
cd "$FRONTEND_DIR"

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${RED}Error: .env file not found in frontend directory${NC}"
    echo -e "${YELLOW}Please create a .env file with the following variables:${NC}"
    echo "VITE_ENVIRONMENT=production"
    echo "VITE_API_ENDPOINT=<your-api-gateway-endpoint>"
    echo "VITE_API_KEY=<your-api-key>"
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    pnpm install
fi

# Build the frontend
echo -e "${YELLOW}Building production bundle...${NC}"
pnpm run build

# Check if build was successful
if [ ! -d "dist" ]; then
    echo -e "${RED}Error: Build failed. dist directory not found.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Frontend built successfully${NC}"

# Step 3: Sync to S3
echo -e "\n${YELLOW}Step 3: Uploading to S3...${NC}"
aws s3 sync dist/ "s3://$BUCKET_NAME/" \
    --delete \
    --cache-control "public, max-age=31536000, immutable" \
    --exclude "index.html"

# Upload index.html separately with no-cache to ensure updates are always fetched
aws s3 cp dist/index.html "s3://$BUCKET_NAME/index.html" \
    --cache-control "no-cache, no-store, must-revalidate" \
    --content-type "text/html"

echo -e "${GREEN}✓ Files uploaded to S3${NC}"

# Step 4: Invalidate CloudFront cache
echo -e "\n${YELLOW}Step 4: Invalidating CloudFront cache...${NC}"
INVALIDATION_ID=$(aws cloudfront create-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --paths "/*" \
    --query "Invalidation.Id" \
    --output text)

echo -e "${GREEN}✓ CloudFront invalidation created: $INVALIDATION_ID${NC}"
echo -e "${YELLOW}Note: Invalidation may take a few minutes to complete.${NC}"

# Step 5: Summary
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Frontend URL: $CLOUDFRONT_URL${NC}"
echo -e "\n${YELLOW}Tips:${NC}"
echo -e "- Check invalidation status: aws cloudfront get-invalidation --distribution-id $DISTRIBUTION_ID --id $INVALIDATION_ID"
echo -e "- View S3 bucket: aws s3 ls s3://$BUCKET_NAME/"
echo -e "- CloudFront may take 5-10 minutes to fully propagate changes globally"
echo ""
