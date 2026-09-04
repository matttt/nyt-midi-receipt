FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV PORT=6434
EXPOSE 6434

CMD ["node", "src/app.js"]
