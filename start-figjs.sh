#!/bin/sh
# Starts FigJS (macOS, Linux):  sh start-figjs.sh
# Uses Node.js 18+ if installed, else downloads a private copy into
# .runtime/node once. NODE_MIRROR points at another copy of nodejs.org/dist.

cd "$(dirname "$0")" || exit 1

fetch() {
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$1"; else wget -qO- "$1"; fi
}

get_node() {
  mirror="${NODE_MIRROR:-https://nodejs.org/dist}"
  case "$(uname -s)" in
    Darwin) os=darwin ;;
    Linux) os=linux ;;
    *) echo "  Unsupported system: $(uname -s)"; return 1 ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64) arch=x64 ;;
    arm64|aarch64) arch=arm64 ;;
    *) echo "  Unsupported processor: $(uname -m)"; return 1 ;;
  esac

  version=$(fetch "$mirror/index.json" | tr '{' '\n' | grep '"lts":"' | head -n 1 \
    | sed 's/.*"version":"\([^"]*\)".*/\1/')
  [ -n "$version" ] || return 1
  file="node-$version-$os-$arch.tar.gz"
  expected=$(fetch "$mirror/$version/SHASUMS256.txt" | grep " $file\$" | cut -d' ' -f1)
  [ -n "$expected" ] || return 1

  echo "  Downloading Node.js $version ($arch) ..."
  mkdir -p .runtime
  fetch "$mirror/$version/$file" > ".runtime/$file" || return 1
  if command -v shasum >/dev/null 2>&1; then
    actual=$(shasum -a 256 ".runtime/$file" | cut -d' ' -f1)
  else
    actual=$(sha256sum ".runtime/$file" | cut -d' ' -f1)
  fi
  if [ "$actual" != "$expected" ]; then
    echo "  The download does not match its published checksum."
    rm -f ".runtime/$file"
    return 1
  fi

  rm -rf .runtime/node .runtime/unpack && mkdir .runtime/unpack
  tar -xzf ".runtime/$file" -C .runtime/unpack || return 1
  mv .runtime/unpack/* .runtime/node && rmdir .runtime/unpack && rm -f ".runtime/$file"
  echo "  Node.js $version is ready."
}

NODE=""
if command -v node >/dev/null 2>&1 && node -e "process.exit(Number(process.versions.node.split('.')[0]) < 18 ? 1 : 0)"; then
  NODE=node
elif [ -x .runtime/node/bin/node ]; then
  NODE=.runtime/node/bin/node
else
  echo ""
  echo "  Node.js 18 or newer was not found. A private copy is downloaded into"
  echo "  .runtime/node, once. Nothing is installed on the system."
  echo ""
  if ! get_node; then
    echo ""
    echo "  Node.js could not be downloaded. Check the internet connection, or"
    echo "  install Node.js from https://nodejs.org and start again."
    exit 1
  fi
  NODE=.runtime/node/bin/node
fi

exec "$NODE" editor/server/start.js "$@"
