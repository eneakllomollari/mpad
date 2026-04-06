FROM ubuntu:22.04

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://entire.io/install.sh | bash \
    && mv /root/.local/bin/entire /usr/local/bin/entire
