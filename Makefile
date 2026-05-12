.PHONY: ingest transform web check-bundle-size test

ingest:
	cd go && go run ./cmd/ingest-all

transform:
	cd go && go run ./cmd/transform

web:
	npm run build

check-bundle-size: web
	cd go && go run ./cmd/check-bundle-size

test:
	cd go && go test ./...
	npm test
