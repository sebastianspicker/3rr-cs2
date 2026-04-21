# Same order as CI pipeline (lint, test, security).
.PHONY: lint fmt test security ci clean help

help: ## Show available targets
	@grep -E '^[a-z][a-z_-]+:.*##' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-12s %s\n", $$1, $$2}'

lint: ## Static checks: bash -n, shellcheck, shfmt -d
	./scripts/lint.sh

fmt: ## Auto-format scripts with shfmt
	./scripts/fmt.sh

test: ## Run stub-based test suite
	./tests/run.sh

security: ## Secret scan and dependency-manifest guard
	./scripts/security.sh

ci: lint test security ## Full CI pipeline (lint + test + security)

clean: ## Remove temp and cache files
	rm -rf .cache/ tmp.* tests/tmp.*
