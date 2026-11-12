BIN := kargo

.PHONY: build test lint

build:
	go build -o $(BIN) ./cmd/kargo

test:
	go test ./...

lint:
	go vet ./...
