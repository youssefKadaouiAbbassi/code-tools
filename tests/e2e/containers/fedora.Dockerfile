FROM fedora:41
RUN dnf install -y curl unzip git sudo
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"
WORKDIR /app
