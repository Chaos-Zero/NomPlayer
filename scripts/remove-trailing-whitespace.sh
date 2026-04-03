#!/usr/bin/env bash
set -euo pipefail

# This script removes trailing whitespace from all staged files.
# It ensures exactly one newline at the end of each file.

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

# Get all staged files (excluding deletions)
# Using -z to handle spaces in filenames
staged_files=$(git diff --cached --name-only --diff-filter=ACMR -z | xargs -0)

if [[ -z "$staged_files" ]]; then
  exit 0
fi

for file in $staged_files; do
  # Skip binary files and this script itself
  if [[ -f "$file" ]] && ! grep -qI $'\0' "$file" && [[ "$file" != "scripts/remove-trailing-whitespace.sh" ]]; then
    # 1. Remove trailing whitespace from all lines
    sed -i 's/[[:space:]]*$//' "$file"

    # 2. Ensure exactly one newline at EOF using perl
    # This replaces ALL trailing whitespace at the very end of the file with exactly one newline.
    perl -i -0777 -pe 's/\s+\z/\n/g' "$file"

    # Restage the file
    git add "$file"
  fi
done
