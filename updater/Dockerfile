# Small, internal-only service - see PLANNING.md #15. node:20-slim (Debian)
# rather than Alpine because it needs Docker's own apt repo for the
# `docker compose` v2 CLI plugin, matching the rest of the stack's Debian
# base (CLAUDE.md's Prisma-on-Alpine gotcha, even though this image itself
# never touches Prisma directly).
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      git openssh-client ca-certificates curl gnupg \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
       > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json .
RUN npm install --omit=dev
COPY server.js .

EXPOSE 4100
CMD ["node", "server.js"]
