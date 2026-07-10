# Collector image for the cloud content-sync job.
# Build context is the repo root (config.yaml must be included):
#   docker build -f ingest_utils/confluence_processor/Dockerfile .
FROM python:3.12-slim

# ffmpeg: video chunking; libreoffice: docx/pptx -> pdf; libmediainfo: duration probing
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        libreoffice-writer \
        libreoffice-impress \
        fonts-liberation \
        libmediainfo0v5 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY ingest_utils/confluence_processor/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Scripts resolve config.yaml two directories above their own location
COPY config.yaml /app/config.yaml
COPY ingest_utils/confluence_processor/*.py /app/ingest_utils/confluence_processor/

WORKDIR /app/ingest_utils/confluence_processor
CMD ["python", "run_collector.py"]
