# Same order as CI pipeline (lint, security).
.PHONY: lint fmt security ci clean help

help: ## Show available targets
	@grep -E '^[a-z][a-z_-]+:.*##' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-12s %s\n", $$1, $$2}'

lint: ## Static checks: bash -n, shellcheck, shfmt -d
	./scripts/lint.sh

fmt: ## Auto-format scripts with shfmt
	./scripts/fmt.sh

security: ## Secret scan and dependency-manifest guard
	./scripts/security.sh

ci: lint security ## Full CI pipeline (lint + security)

clean: ## Remove temp and cache files
	rm -rf .cache/ tmp.*
