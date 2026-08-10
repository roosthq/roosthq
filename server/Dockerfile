FROM node:20-slim

WORKDIR /app

# OpenSSL is required by Prisma's query/schema engine. Debian-slim omits it, and
# Alpine/musl causes engine-load failures - so use slim + openssl.
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Install deps first for better layer caching
COPY package*.json ./
RUN npm install

# Prisma schema needed for client generation
COPY prisma ./prisma
RUN npx prisma generate

COPY . .

# Built unconditionally so the image always has a usable dist/ - dev
# (docker-compose.yml's default) ignores it and runs off the bind-mounted
# source instead; prod (docker-compose.prod.yml) overrides CMD to run this
# build directly, no live file-watcher in the loop to race with itself.
RUN npm run build

EXPOSE 3000

# Dev by default; docker-compose.prod.yml overrides this to `npm run start:prod`.
CMD ["npm", "run", "start:dev"]
