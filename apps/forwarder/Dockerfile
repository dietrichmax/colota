FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM gcr.io/distroless/nodejs26-debian13:nonroot@sha256:a84242e747fbb5aaaa0180c273b6f7130ca34b3300082192ef58eea96089eb3c
LABEL org.opencontainers.image.source="https://github.com/dietrichmax/colota"
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist/server.cjs ./
EXPOSE 3000
CMD ["server.cjs"]
