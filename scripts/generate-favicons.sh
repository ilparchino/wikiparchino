#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SOURCE=${1:-"$ROOT_DIR/assets/logo_mono_variant_1200x1200_white.png"}
PUBLIC_DIR="$ROOT_DIR/public"
ICON_DIR="$PUBLIC_DIR/icons"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is required to generate favicons." >&2
  exit 1
fi

if [ ! -f "$SOURCE" ]; then
  echo "Source image not found: $SOURCE" >&2
  exit 1
fi

mkdir -p "$ICON_DIR"

resize_png() {
  local size=$1
  local output=$2
  ffmpeg -hide_banner -loglevel error -y -i "$SOURCE" \
    -vf "scale=${size}:${size}:flags=lanczos" \
    -frames:v 1 "$output"
}

maskable_png() {
  local size=$1
  local inner_size=$2
  local output=$3
  ffmpeg -hide_banner -loglevel error -y -i "$SOURCE" \
    -vf "scale=${inner_size}:${inner_size}:flags=lanczos,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=white" \
    -frames:v 1 "$output"
}

resize_png 16 "$PUBLIC_DIR/favicon-16x16.png"
resize_png 32 "$PUBLIC_DIR/favicon-32x32.png"
resize_png 48 "$PUBLIC_DIR/favicon-48x48.png"
resize_png 180 "$PUBLIC_DIR/apple-touch-icon.png"
resize_png 192 "$ICON_DIR/icon-192x192.png"
resize_png 512 "$ICON_DIR/icon-512x512.png"

# Keep the artwork inside the maskable safe zone (80% of the icon canvas).
maskable_png 192 154 "$ICON_DIR/icon-maskable-192x192.png"
maskable_png 512 410 "$ICON_DIR/icon-maskable-512x512.png"

ffmpeg -hide_banner -loglevel error -y -i "$SOURCE" \
  -vf "scale=48:48:flags=lanczos" \
  -frames:v 1 "$PUBLIC_DIR/favicon.ico"

ffmpeg -hide_banner -loglevel error -y -i "$SOURCE" \
  -vf "scale=1100:1100:flags=lanczos,pad=1200:1200:50:50:color=white,crop=1200:630:0:285" \
  -frames:v 1 "$PUBLIC_DIR/social-preview.png"

echo "Favicons and social preview generated in $PUBLIC_DIR"
