# syntax=docker/dockerfile:1
# Build: portal (node) -> binary (go) -> distroless runtime.
FROM node:22-alpine AS portal
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=portal /src/internal/portal/dist ./internal/portal/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /out/enumaracle ./cmd/enumaracle

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/enumaracle /enumaracle
ENV ENUMARACLE_HTTP_ADDR=:8080 ENUMARACLE_DNS_ADDR=:5353 ENUMARACLE_DB_DSN=file:/data/enumaracle.db
VOLUME ["/data"]
EXPOSE 8080/tcp 5353/udp 5353/tcp
USER nonroot
ENTRYPOINT ["/enumaracle"]
