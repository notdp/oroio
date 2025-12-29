#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: install.sh [options]

选项:
  --prefix <dir>    指定安装目录（默认: $HOME/.local/bin）
  --reinstall       覆盖已安装的 dk（显式声明重装，默认也会覆盖同名文件）
  -h, --help        显示本帮助

示例:
  ./install.sh
  ./install.sh --prefix /usr/local/bin
  curl -fsSL https://raw.githubusercontent.com/notdp/oroio/main/install.sh | bash
USAGE
}

die() {
  printf 'install.sh: %s\n' "$*" >&2
  exit 1
}

path_has() {
  case ":$PATH:" in
  *":$1:"*) return 0 ;;
  *) return 1 ;;
  esac
}

DK_TMPDIR=""
DK_SRC=""
SERVE_SRC=""
WEB_DIR=""

make_tmpdir() {
  if [ -z "$DK_TMPDIR" ]; then
    DK_TMPDIR=$(mktemp -d)
    trap 'rm -rf "$DK_TMPDIR"' EXIT
  fi
}

fetch_component() {
  local name="$1" url="$2" out_var="$3"

  command -v curl >/dev/null 2>&1 || die "需要 curl 以下载 $name"
  make_tmpdir
  local dest="$DK_TMPDIR/$name"
  local ts
  ts=$(date +%s)
  printf '正在从 %s 下载 %s...\n' "$url" "$name"
  curl -fsSL -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' "${url}?ts=${ts}" -o "$dest" \
    || die "下载 $name 失败（检查网络或仓库分支是否存在）"
  chmod +x "$dest"
  printf -v "$out_var" '%s' "$dest"
}

fetch_web_assets() {
  make_tmpdir
  WEB_DIR="$DK_TMPDIR/web"
  install -d "$WEB_DIR"

  local base="https://github.com/notdp/oroio/releases/download/web-dist"
  local ts
  ts=$(date +%s)
  printf '正在下载 web 资源...\n'
  curl -fsSL -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' "${base}/index.html?ts=${ts}" \
    -o "$WEB_DIR/index.html" || die "下载 index.html 失败"
}

locate_sources() {
  local base="https://raw.githubusercontent.com/notdp/oroio/main/bin"
  fetch_component "dk" "$base/dk" DK_SRC
  fetch_component "serve.py" "$base/serve.py" SERVE_SRC
  fetch_web_assets
}

ALIAS_LINE="alias droid='dk run droid'"
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

install_alias() {
  local rc_file="$1"
  if [ ! -f "$rc_file" ]; then
    touch "$rc_file"
  fi
  if grep -qF "$ALIAS_MARKER" "$rc_file" 2>/dev/null; then
    return 1
  fi
  printf '\n%s  %s\n' "$ALIAS_LINE" "$ALIAS_MARKER" >> "$rc_file"
  return 0
}

main() {
  local prefix="${DK_PREFIX:-$HOME/.local/bin}"
  local reinstall=0

  while [ $# -gt 0 ]; do
    case "$1" in
    --prefix)
      shift || die "--prefix 需要路径"
      prefix="$1"
      ;;
    --reinstall)
      reinstall=1
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

  locate_sources

  install -d "$prefix"
  install -m 0755 "$DK_SRC" "$prefix/dk"
  install -m 0755 "$SERVE_SRC" "$prefix/serve.py"

  local oroio_dir="$HOME/.oroio"
  local web_dest="$oroio_dir/web"
  install -d "$web_dest"
  cp -r "$WEB_DIR"/* "$web_dest/"

  local rc_file
  rc_file=$(detect_shell_rc)
  local alias_added=0
  if install_alias "$rc_file"; then
    alias_added=1
  fi

  printf '\n安装完成:\n'
  printf '  - 已将 dk 安装到 %s/dk\n' "$prefix"
  printf '  - 已将 serve.py 安装到 %s/serve.py\n' "$prefix"
  printf '  - 已将 web 资源安装到 %s\n' "$web_dest"
  if ! path_has "$prefix"; then
    printf '  - 注意: %s 不在 PATH，请手动加入后再使用。\n' "$prefix"
  else
    printf '  - PATH 已包含 %s，可直接运行 dk。\n' "$prefix"
  fi
  printf '  - 数据目录为 %s（首次运行时自动创建）。\n' "$HOME/.oroio"

  if [ "$alias_added" -eq 1 ]; then
    printf '  - 已在 %s 添加 alias，执行以下命令立即生效:\n' "$rc_file"
    printf '      source %s\n' "$rc_file"
  else
    printf '  - alias 已存在于 %s，跳过。\n' "$rc_file"
  fi

  if [ "$reinstall" -eq 1 ]; then
    printf '  - 已覆盖旧版本 (--reinstall)。\n'
  fi
}

main "$@"
