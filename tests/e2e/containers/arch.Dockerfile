FROM archlinux:latest
RUN pacman -Sy --noconfirm curl unzip git sudo
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"
WORKDIR /app
