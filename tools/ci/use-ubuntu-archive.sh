#!/usr/bin/env bash
set -euo pipefail

sources=/etc/apt/sources.list.d/ubuntu.sources

has_release_indexes() {
  local base=$1 pocket
  for pocket in noble noble-updates noble-backports noble-security; do
    curl --head --fail --silent --show-error --connect-timeout 5 --max-time 10 \
      "$base/dists/$pocket/InRelease" >/dev/null || return 1
  done
}

mirror=
for candidate in https://archive.ubuntu.com/ubuntu https://mirrors.mit.edu/ubuntu; do
  echo "Checking Ubuntu release indexes at $candidate"
  if has_release_indexes "$candidate"; then
    mirror=$candidate
    break
  fi
done
if [[ -z $mirror ]]; then
  echo 'No configured Ubuntu mirror has reachable indexes for all four Noble pockets.' >&2
  exit 1
fi

# Keep the runner's suites, components, and signing key while bypassing its Azure mirror list.
sudo sed -E -i 's#^URIs:[[:blank:]]+(mirror\+file:/etc/apt/apt-mirrors\.txt|https?://(azure\.archive|archive|security)\.ubuntu\.com/ubuntu/?|https://mirrors\.mit\.edu/ubuntu)$#URIs: '"$mirror"'#' "$sources"
if grep -Eq '^URIs:.*(mirror\+file:/etc/apt/apt-mirrors\.txt|azure\.archive\.ubuntu\.com)' "$sources"; then
  echo 'The Ubuntu sources still reference the runner mirror list or Azure mirror.' >&2
  exit 1
fi
grep -Fxq "URIs: $mirror" "$sources"
grep '^URIs:' "$sources"
