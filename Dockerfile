FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:cb606325b7ec4af55462cb0b424a53b452a5b4a894ffe841fcf1048d216fb9f8
LABEL org.opencontainers.image.source="https://github.com/dietrichmax/colota-forwarder"
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist/server.cjs ./
EXPOSE 3000
CMD ["server.cjs"]
