#!/usr/bin/env bash
set -euo pipefail

install_with_brew() {
  brew install gitleaks
}

install_with_go() {
  local gobin
  gobin="${GOBIN:-$HOME/.local/bin}"
  mkdir -p "$gobin"
  GOBIN="$gobin" go install github.com/gitleaks/gitleaks/v8@latest
}

install_with_scoop() {
  scoop install gitleaks
}

install_with_winget() {
  winget install --exact --id Gitleaks.Gitleaks
}

install_with_pacman() {
  sudo pacman -Sy --noconfirm gitleaks
}

print_missing_installer_help() {
  cat <<'EOF'
Unable to install gitleaks automatically.

Supported automatic install methods:
  - Homebrew
  - Go (installs to ~/.local/bin by default)
  - Scoop
  - winget
  - pacman

Install it manually instead:
  https://github.com/gitleaks/gitleaks
EOF
}

main() {
  if command -v gitleaks >/dev/null 2>&1; then
    echo "gitleaks is already installed."
    exit 0
  fi

  if command -v brew >/dev/null 2>&1; then
    install_with_brew
  elif command -v go >/dev/null 2>&1; then
    install_with_go
  elif command -v scoop >/dev/null 2>&1; then
    install_with_scoop
  elif command -v winget >/dev/null 2>&1; then
    install_with_winget
  elif command -v pacman >/dev/null 2>&1; then
    install_with_pacman
  else
    print_missing_installer_help >&2
    exit 1
  fi

  export PATH="$HOME/.local/bin:$HOME/go/bin:$PATH"

  if ! command -v gitleaks >/dev/null 2>&1; then
    cat >&2 <<'EOF'
Automatic installation finished, but gitleaks is still not on PATH for this shell.
Open a new shell or add its install directory to PATH, then run the commit again.
EOF
    exit 1
  fi

  echo "gitleaks installed successfully."
}

main "$@"
