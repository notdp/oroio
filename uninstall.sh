#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: uninstall.sh [options]

选项:
  --prefix <dir>    需要移除的安装目录（默认: $HOME/.local/bin）
  -h, --help        显示本帮助

示例:
  ./uninstall.sh
  ./uninstall.sh --prefix /usr/local/bin
  curl -fsSL https://raw.githubusercontent.com/notdp/oroio/main/uninstall.sh | bash
USAGE
}

die() {
  printf 'uninstall.sh: %s\n' "$*" >&2
  exit 1
}

ALIAS_MARKER="# dk-alias"

detect_shell_rc() {
  local shell_name
  shell_name=$(basename "${SHELL:-/bin/bash}")
  case "$shell_name" in
    zsh)  echo "$HOME/.zshrc" ;;
    bash) echo "$HOME/.bashrc" ;;
    *)    echo "$HOME/.bashrc" ;;
  esac
}

remove_alias() {
  local rc_file="$1"
  if [ ! -f "$rc_file" ]; then
    return 1
  fi
  if ! grep -qF "$ALIAS_MARKER" "$rc_file" 2>/dev/null; then
    return 1
  fi
  local tmp_file
  tmp_file=$(mktemp)
  grep -vF "$ALIAS_MARKER" "$rc_file" > "$tmp_file"
  mv "$tmp_file" "$rc_file"
  return 0
}

main() {
  local prefix="${DK_PREFIX:-$HOME/.local/bin}"
  local -a summary=()

  while [ $# -gt 0 ]; do
    case "$1" in
    --prefix)
      shift || die "--prefix 需要路径"
      prefix="$1"
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*)
      die "未知参数: $1"
      ;;
    *)
      break
      ;;
    esac
    shift || true
  done

  local dk_path="$prefix/dk"
  if [ -e "$dk_path" ]; then
    rm -f "$dk_path"
    summary+=("已移除 $dk_path")
  else
    summary+=("未在 $prefix 找到 dk (跳过)")
  fi

  local rc_file
  rc_file=$(detect_shell_rc)
  if remove_alias "$rc_file"; then
    summary+=("已从 $rc_file 移除 droid alias")
  else
    summary+=("未在 $rc_file 找到 droid alias (跳过)")
  fi

  printf '\n卸载结果:\n'
  local i
  for i in "${!summary[@]}"; do
    printf '  %d. %s\n' "$((i + 1))" "${summary[$i]}"
  done
}

main "$@"
