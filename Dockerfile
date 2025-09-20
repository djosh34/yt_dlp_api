FROM oven/bun:latest AS base

WORKDIR /app

RUN apt-get update && apt-get install -y curl \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install yt-dlp depending on CPU architecture
RUN arch=$(uname -m) \
    && if [ "$arch" = "aarch64" ]; then \
        echo "Detected ARM64 ($arch), downloading yt-dlp for aarch64"; \
        curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64 \
          -o /usr/local/bin/yt-dlp; \
    elif [ "$arch" = "x86_64" ]; then \
        echo "Detected x86_64 ($arch), downloading yt-dlp for x86_64"; \
        curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
          -o /usr/local/bin/yt-dlp; \
    else \
        echo "Unsupported architecture: $arch" && exit 1; \
    fi \
    && chmod +x /usr/local/bin/yt-dlp

# RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64 \
#         -o /usr/local/bin/yt-dlp \
#     && chmod +x /usr/local/bin/yt-dlp 

# RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
#         -o /usr/local/bin/yt-dlp \
#     && chmod +x /usr/local/bin/yt-dlp \



COPY package.json tsconfig.json ./

RUN bun install

COPY src ./src


CMD ["bun", "src/index.ts"]
