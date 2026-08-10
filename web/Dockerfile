# ---- builder: installs deps + (in prod) compiles the app at IMAGE BUILD
# time, not container start. The old single-stage image's CMD was literally
# "npm run build && vite preview" - every container start (or restart)
# silently rebuilt from whatever was on disk, and a plain `docker compose up
# --build` sometimes skipped rebuilding the image layer entirely, serving a
# stale bundle with no error anywhere. Worked around all deploy long with a
# manual `build --no-cache` + hash-check ritual; this removes the need for it
# entirely - the build now either lands in the image or the image build
# itself fails loudly.
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Single-origin design (CLAUDE.md) - this is a fixed value in every real
# deployment, not per-environment config. A build ARG still lets it be
# overridden if that ever stops being true.
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# ---- dev: hot-reload dev server. docker-compose.yml targets this stage and
# bind-mounts source over /app, so the RUN npm run build above never actually
# matters for dev - only builder's `npm install` (node_modules) does.
FROM builder AS dev
EXPOSE 5173
CMD ["npm", "run", "dev"]

# ---- runtime: prod default (no target = last stage). Just serves the
# already-built static files - no source, no dev dependencies, no build step
# left to silently skip.
FROM node:20-alpine AS runtime
WORKDIR /app
RUN npm install -g serve@14
COPY --from=builder /app/dist ./dist
EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
