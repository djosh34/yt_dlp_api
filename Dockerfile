FROM ubuntu:24.04

WORKDIR /app

RUN apt-get update && \
    apt-get install -y curl ca-certificates python3 && \
    rm -rf /var/lib/apt/lists/*

RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/download/2025.09.05/yt-dlp_linux_aarch64 -o yt-dlp
RUN chmod +x yt-dlp

COPY main.py main.py

CMD ["tail", "-f", "/dev/null"]
