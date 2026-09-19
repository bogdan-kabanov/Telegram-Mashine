#!/usr/bin/env bash
# Back-compat: production setup is native (no Docker).
exec bash "$(dirname "$0")/remote-setup-native.sh" "$@"
