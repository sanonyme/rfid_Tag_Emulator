FROM node:22-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node server.mjs schema.sql ./
USER node
EXPOSE 8787
CMD ["node", "server.mjs"]
