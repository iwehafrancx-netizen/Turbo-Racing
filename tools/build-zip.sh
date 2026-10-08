#!/usr/bin/env bash
# Packs the game into dist/turbo-racing.zip (index.html at the zip root),
# ready to upload to the CrazyGames developer portal.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/turbo-racing.zip
zip -r -q dist/turbo-racing.zip index.html css fonts lib src Assets -x '*.DS_Store'
echo "Built dist/turbo-racing.zip ($(du -h dist/turbo-racing.zip | cut -f1))"
