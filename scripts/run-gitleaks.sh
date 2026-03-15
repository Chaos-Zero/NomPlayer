#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if [[ -z "$(git diff --cached --name-only --diff-filter=ACMRDTUXB)" ]]; then
  exit 0
fi

if ! command -v gitleaks >/dev/null 2>&1; then
  cat >&2 <<'EOF'
gitleaks is required by this repository's pre-commit hook, but it is not installed.

Install gitleaks, then run the commit again.
Docs: https://github.com/gitleaks/gitleaks
EOF
  exit 1
fi

if gitleaks git --help >/dev/null 2>&1; then
  exec gitleaks git --staged --redact --no-banner
fi

if gitleaks protect --help >/dev/null 2>&1; then
  exec gitleaks protect --staged --redact --no-banner
fi

cat >&2 <<'EOF'
Unsupported gitleaks version.
Expected either:
  - gitleaks git --staged
  - gitleaks protect --staged
EOF
exit 1
