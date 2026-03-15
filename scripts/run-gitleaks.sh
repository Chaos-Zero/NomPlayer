#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"
export PATH="$repo_root/node_modules/.bin:$HOME/.local/bin:$HOME/go/bin:$PATH"

prompt_for_install() {
  local response=""

  if [[ -t 0 && -t 1 ]]; then
    cat <<'EOF'
gitleaks is required by this repository's pre-commit hook, but it is not installed.
EOF
    printf 'Install gitleaks automatically now? [y/N] '
    read -r response || response=""
  elif { exec 3<>/dev/tty; } 2>/dev/null; then
    cat >&3 <<'EOF'
gitleaks is required by this repository's pre-commit hook, but it is not installed.
EOF
    printf 'Install gitleaks automatically now? [y/N] ' >&3
    read -r response <&3 || response=""
    exec 3>&-
    exec 3<&-
  else
    return 2
  fi

  case "$response" in
    [yY]|[yY][eE][sS])
      "$repo_root/scripts/install-gitleaks.sh"
      return 0
      ;;
    *)
      cat >&2 <<'EOF'
Skipping automatic install.
Install gitleaks, then run the commit again.
Docs: https://github.com/gitleaks/gitleaks
EOF
      return 1
      ;;
  esac
}

if [[ -z "$(git diff --cached --name-only --diff-filter=ACMRDTUXB)" ]]; then
  exit 0
fi

if ! command -v gitleaks >/dev/null 2>&1; then
  if ! prompt_for_install; then
    prompt_status=$?
    if [[ $prompt_status -ne 2 ]]; then
      exit 1
    fi
  fi

  if ! command -v gitleaks >/dev/null 2>&1; then
    cat >&2 <<'EOF'
gitleaks is required by this repository's pre-commit hook, but it is not installed.

Install gitleaks, then run the commit again.
Docs: https://github.com/gitleaks/gitleaks
EOF
    exit 1
  fi
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
