FROM node:20-alpine

WORKDIR /app

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
