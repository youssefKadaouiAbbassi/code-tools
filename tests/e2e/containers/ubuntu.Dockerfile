FROM ubuntu:24.04
RUN apt-get update && apt-get install -y curl unzip git sudo
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"
WORKDIR /app
