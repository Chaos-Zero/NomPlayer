#!/usr/bin/env bash
set -euo pipefail

# This script removes trailing whitespace from all staged files.
# It ensures exactly one newline at the end of each file.

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

# Get all staged files (excluding deletions)
# Using -z to handle spaces in filenames
staged_files=()
while IFS= read -r -d '' file; do
  [[ -n "$file" ]] && staged_files+=("$file")
done < <(git diff --cached --name-only --diff-filter=ACMR -z)

if [[ ${#staged_files[@]} -eq 0 ]]; then
  exit 0
fi

for file in "${staged_files[@]}"; do
  # Skip binary files, this script itself, and only process files that exist
  if [[ -f "$file" ]] && grep -qI . "$file" && [[ "$file" != "scripts/remove-trailing-whitespace.sh" ]]; then
    # 1. Remove trailing whitespace from all lines
    # Using [ \t]*$ is more explicit for some sed versions
    if sed --version 2>/dev/null | grep -q GNU; then
      sed -i 's/[[:space:]]*$//' "$file"
    else
      sed -i '' 's/[[:space:]]*$//' "$file"
    fi

    # 2. Ensure exactly one newline at EOF using perl
    # This replaces ALL trailing whitespace at the very end of the file with exactly one newline.
    perl -i -0777 -pe 's/\s+\z/\n/g' "$file"

    # Restage the file
    git add "$file"
  fi
done
