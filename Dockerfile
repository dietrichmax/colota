FROM node:24-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:a6c34457f6da4295807e051411c7783739c65b997a324fed14e4fa292615ae91
LABEL org.opencontainers.image.source="https://github.com/dietrichmax/colota-forwarder"
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist/server.cjs ./
EXPOSE 3000
CMD ["server.cjs"]
