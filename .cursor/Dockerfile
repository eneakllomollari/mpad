FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash curl ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://entire.io/install.sh | bash \
    && mv /root/.local/bin/entire /usr/local/bin/entire
