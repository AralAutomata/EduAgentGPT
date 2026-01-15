#!/usr/bin/env bash
set -euo pipefail

# Run the memory-enabled entry point with local Deno cache + required permissions.
# DENO_DIR keeps the cache inside the project so FFI binaries are writable.
DENO_DIR=.deno_dir deno run --allow-read --allow-env --allow-net --allow-write --allow-ffi src/main_with_memory.ts
