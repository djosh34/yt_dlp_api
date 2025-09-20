FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        ca-certificates \
        && rm -rf /var/lib/apt/lists/*

RUN pip install yt-dlp==2025.8.11

WORKDIR /app

COPY main.py main.py

CMD ["bash"]
