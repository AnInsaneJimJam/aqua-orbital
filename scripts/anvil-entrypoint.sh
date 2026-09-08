#!/bin/sh
set -eu
if [ -s /data/state.json ]; then
  set -- "$@" --load-state /data/state.json
fi
exec anvil "$@"
