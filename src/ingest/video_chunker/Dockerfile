FROM public.ecr.aws/lambda/python:3.13

# Install ffmpeg and ffprobe
# Note: curl-minimal is already in base image, no need to install curl
RUN dnf install -y tar gzip xz && \
    curl -O https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz && \
    tar -xf ffmpeg-release-amd64-static.tar.xz && \
    mv ffmpeg-*-amd64-static/ffmpeg /usr/local/bin/ && \
    mv ffmpeg-*-amd64-static/ffprobe /usr/local/bin/ && \
    rm -rf ffmpeg-* && \
    dnf clean all

# Copy requirements and install Python dependencies
COPY requirements.txt ${LAMBDA_TASK_ROOT}/
RUN pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt

# Copy function code
COPY chunk_video.py ${LAMBDA_TASK_ROOT}/

# Set the CMD to your handler
CMD [ "chunk_video.lambda_handler" ]
