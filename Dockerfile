FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY app.js fetchMidi.js parseNYT.js renderGrid.js ./

ENV PORT=6434
EXPOSE 6434

CMD ["node", "app.js"]
