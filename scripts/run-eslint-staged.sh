#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"
export PATH="$repo_root/node_modules/.bin:$PATH"

if ! command -v eslint >/dev/null 2>&1; then
  cat >&2 <<'EOF'
ESLint is required by this repository's pre-commit hook, but it is not installed.

Run npm install, then try the commit again.
EOF
  exit 1
fi

files=()
while IFS= read -r -d '' file; do
  [[ -n "$file" ]] && files+=("$file")
done < <(git diff --cached --name-only --diff-filter=ACMR -z -- '*.js' '*.jsx')

if [[ ${#files[@]} -eq 0 ]]; then
  exit 0
fi


# --no-warn-ignored: extension/ has its own separate eslint.config.js and is
# deliberately excluded from the root one (see eslint.config.js's
# globalIgnores), so any staged extension/*.js file reaching this point is
# correctly ignored, not a mistake - without this flag, ESLint warns on every
# such file instead of just skipping it quietly.
eslint --fix --no-warn-ignored "${files[@]}"
git add -- "${files[@]}"
