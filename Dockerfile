FROM node:26-alpine@sha256:c6ad9e9c1d80f6eb607c26b4b0a132ff7a2344fad1c78ea3baa2a7d4c8de6d94 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM gcr.io/distroless/nodejs26-debian13:nonroot@sha256:a51c5d631b90e1b298e17a88a307b77f0b959b47de942d033acce0c96be3fb83
LABEL org.opencontainers.image.source="https://github.com/dietrichmax/colota-forwarder"
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist/server.cjs ./
EXPOSE 3000
CMD ["server.cjs"]
