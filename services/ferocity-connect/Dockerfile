FROM node:24.7.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --omit=dev=false
COPY src ./src
COPY services/ferocity-connect ./services/ferocity-connect
EXPOSE 8787
CMD ["npx", "tsx", "services/ferocity-connect/src/server.ts"]
