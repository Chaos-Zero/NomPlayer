#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

max_staged_file_bytes="${MAX_STAGED_FILE_BYTES:-2097152}"

if ! git diff --cached --check --no-color; then
  cat >&2 <<'EOF'
Pre-commit hygiene checks failed.
Fix the issues above, then try the commit again.
EOF
  exit 1
fi

large_files=()

while IFS= read -r -d '' path; do
  size="$(git cat-file -s ":$path" 2>/dev/null || printf '0')"
  if (( size > max_staged_file_bytes )); then
    large_files+=("$path ($size bytes)")
  fi
done < <(git diff --cached --name-only --diff-filter=ACMR -z)

if [[ ${#large_files[@]} -eq 0 ]]; then
  exit 0
fi

cat >&2 <<EOF
The following staged files exceed ${max_staged_file_bytes} bytes:
$(printf '  - %s\n' "${large_files[@]}")

If this is intentional, rerun the commit with a higher MAX_STAGED_FILE_BYTES value.
EOF
exit 1
