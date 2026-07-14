FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

# Dev server by default; for prod build with: npm run build && npm run preview
CMD ["npm", "run", "dev"]
