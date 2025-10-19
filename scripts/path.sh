#!/usr/bin/env bash

# Add project-local binaries to PATH for this shell session
# Usage:
#   source scripts/path.sh

_proj_root="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"

case :$PATH: in
  *:"${_proj_root}/.bin":*) ;;
  *) export PATH="${_proj_root}/.bin:${PATH}" ;;
esac

case :$PATH: in
  *:"${_proj_root}/node_modules/.bin":*) ;;
  *) export PATH="${_proj_root}/node_modules/.bin:${PATH}" ;;
esac

unset _proj_root


