#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"

"$repo_root/scripts/remove-trailing-whitespace.sh"
"$repo_root/scripts/run-gitleaks.sh"
"$repo_root/scripts/run-prettier.sh"
"$repo_root/scripts/run-eslint-staged.sh"
"$repo_root/scripts/run-file-hygiene.sh"
