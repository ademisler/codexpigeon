.PHONY: verify typecheck test build doctor dev install-mac format

verify: typecheck test build doctor

typecheck:
	pnpm typecheck

test:
	pnpm test

build:
	pnpm build

doctor:
	pnpm doctor

dev:
	pnpm dev

install-mac:
	pnpm install:mac

format:
	pnpm format
