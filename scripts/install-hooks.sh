#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

git config core.hooksPath .githooks

printf 'Git hooks installed. core.hooksPath is now set to .githooks\n'
