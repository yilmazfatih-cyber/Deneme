# Enumaracle - build and run targets.
GO      ?= go
BIN     ?= bin/enumaracle
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)

.PHONY: all build portal test vet fmt check run demo docker

all: check build

portal:            ## build the React portal into internal/portal/dist (embedded)
	cd web && npm ci && npm run build

build:             ## build the single binary (uses the committed portal build)
	CGO_ENABLED=0 $(GO) build -trimpath -ldflags "-s -w -X main.version=$(VERSION)" -o $(BIN) ./cmd/enumaracle

test:
	$(GO) test ./...

vet:
	$(GO) vet ./...

fmt:
	gofmt -w ./cmd ./internal

check:             ## formatting, vet, tests
	@test -z "$$(gofmt -l ./cmd ./internal)" || (gofmt -l ./cmd ./internal; exit 1)
	$(GO) vet ./...
	$(GO) test ./...

run: build         ## run locally with SQLite
	ENUMARACLE_DB_DSN=file:enumaracle.db $(BIN)

demo: build        ## run with demo data and a fixed admin password
	ENUMARACLE_DB_DSN=file:demo.db ENUMARACLE_DEMO_DATA=true ENUMARACLE_ADMIN_PASSWORD=Demo-Parola-2026 $(BIN)

docker:
	docker build -t enumaracle:$(VERSION) .
