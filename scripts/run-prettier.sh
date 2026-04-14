#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"
export PATH="$repo_root/node_modules/.bin:$PATH"

if ! command -v prettier >/dev/null 2>&1; then
  cat >&2 <<'EOF'
Prettier is required by this repository's pre-commit hook, but it is not installed.

Run npm install, then try the commit again.
EOF
  exit 1
fi

files=()
while IFS= read -r -d '' file; do
  [[ -n "$file" ]] && files+=("$file")
done < <(git diff --cached --name-only --diff-filter=ACMR -z -- '*.js' '*.jsx' '*.css' '*.html' '*.json' '*.md' '*.yml' '*.yaml')

if [[ ${#files[@]} -eq 0 ]]; then
  exit 0
fi

prettier --write "${files[@]}"
git add -- "${files[@]}"
