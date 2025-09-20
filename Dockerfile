FROM oven/bun:latest AS base

WORKDIR /app

RUN apt-get update && apt-get install -y curl \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64 \
        -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp 

# RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
#         -o /usr/local/bin/yt-dlp \
#     && chmod +x /usr/local/bin/yt-dlp \



COPY package.json tsconfig.json ./

RUN bun install

COPY src ./src


CMD ["bun", "src/index.ts"]
