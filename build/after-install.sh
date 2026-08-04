#!/bin/sh
# electron-builder "afterInstall" hook for the .deb package.
#
# Electron's Chromium SUID sandbox helper (chrome-sandbox) must be owned by
# root with mode 4755, otherwise the app aborts at startup with:
#   "The SUID sandbox helper binary was found, but is not configured correctly."
#
# electron-builder's default postinst chmod can break when the install dir
# contains a space (e.g. "/opt/Clinical Rx"), so we resolve the real path from
# the installed executable and set the permissions explicitly.
set -e

SANDBOX=""
if command -v clinical-rx >/dev/null 2>&1; then
  # /usr/bin/clinical-rx is an update-alternatives symlink into the real
  # install dir — resolve it fully (handles dirs with spaces too).
  SANDBOX="$(dirname "$(readlink -f "$(command -v clinical-rx)")")/chrome-sandbox"
elif [ -f "/opt/ClinicalRx/chrome-sandbox" ]; then
  SANDBOX="/opt/ClinicalRx/chrome-sandbox"
elif [ -f "/opt/Clinical Rx/chrome-sandbox" ]; then
  SANDBOX="/opt/Clinical Rx/chrome-sandbox"
fi

if [ -n "$SANDBOX" ] && [ -f "$SANDBOX" ]; then
  chown root:root "$SANDBOX" 2>/dev/null || true
  chmod 4755 "$SANDBOX" 2>/dev/null || true
fi

exit 0
