.PHONY: ingest transform web check-bundle-size lint test

ingest:
	cd go && go run ./cmd/ingest-all

transform:
	cd go && go run ./cmd/transform

web:
	npm run build

check-bundle-size: web
	cd go && go run ./cmd/check-bundle-size

# golangci-lint v2; config in go/.golangci.yml. Subsumes `go vet`.
lint:
	cd go && golangci-lint run ./...

test: lint
	cd go && go test ./...
	npm test
