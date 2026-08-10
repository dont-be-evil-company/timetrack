#!/usr/bin/env bash

generate_icons() {
  local source_icon="build/icon.png"
  local output_dir_appimage_icons="build/icons"
  local output_dir="build"
  local src_assets_dir="src/assets/icon"

  mkdir -p $output_dir_appimage_icons

  # Array of sizes required for Linux/AppImage compatibility
  local sizes=(16 32 48 64 128 256 512 1024)

  echo "Generating icons from $source_icon..."

  for SIZE in "${sizes[@]}"; do
      dest="$output_dir_appimage_icons/${SIZE}x${SIZE}.png"
      magick "$source_icon" -resize "${SIZE}x${SIZE}" "$dest"
      echo "Created: $dest"
  done

  # Generate .ico file for Windows
  local output_ico="$output_dir/icon.ico"
  magick "$source_icon" -define icon:auto-resize=64,128,256 "$output_ico"
  echo "Created: $output_ico"

  # INFO:
  # Generate .icns file for macOS is not supported on Linux directly.

  cp "$output_dir_appimage_icons/64x64.png" "$src_assets_dir/64x64.png"
  cp "$output_dir/icon.icns" "$src_assets_dir/icon.icns"
  cp "$output_dir/icon.ico" "$src_assets_dir/icon.ico"
  cp "$output_dir/icon.png" "$src_assets_dir/icon.png"
  echo "Copied icons to $src_assets_dir"
}

generate_icons
