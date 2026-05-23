FROM node:20-alpine

WORKDIR /app
COPY package.json ./
COPY server.mjs index.html config.example.json README-V1.md ./
COPY assets ./assets
COPY config.online.json ./config.json

ENV HOST=0.0.0.0
ENV PORT=8787
EXPOSE 8787

CMD ["node", "server.mjs"]
