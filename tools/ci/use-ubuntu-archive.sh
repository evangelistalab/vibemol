#!/usr/bin/env bash
set -euo pipefail

sources=/etc/apt/sources.list.d/ubuntu.sources

# Keep the runner's suites, components, and signing key while bypassing its Azure mirror list.
sudo sed -E -i 's#^URIs:[[:blank:]]+(mirror\+file:/etc/apt/apt-mirrors\.txt|https?://azure\.archive\.ubuntu\.com/ubuntu/?)$#URIs: https://archive.ubuntu.com/ubuntu#' "$sources"
if grep -Eq '^URIs:.*(mirror\+file:/etc/apt/apt-mirrors\.txt|azure\.archive\.ubuntu\.com)' "$sources"; then
  echo 'The Ubuntu sources still reference the runner mirror list or Azure mirror.' >&2
  exit 1
fi
grep '^URIs:' "$sources"
