FROM node:20-slim

WORKDIR /app

# OpenSSL is required by Prisma's query/schema engine. Debian-slim omits it, and
# Alpine/musl causes engine-load failures — so use slim + openssl.
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Install deps first for better layer caching
COPY package*.json ./
RUN npm install

# Prisma schema needed for client generation
COPY prisma ./prisma
RUN npx prisma generate

COPY . .

EXPOSE 3000

# Dev by default; override for prod with: npm run build && npm run start:prod
CMD ["npm", "run", "start:dev"]
