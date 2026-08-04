#!/bin/bash
# electron-builder "afterInstall" hook for the .deb package.
#
# IMPORTANT: when you supply a custom afterInstall script, it REPLACES
# electron-builder's default after-install.tpl. So this script must reproduce
# the default behavior (create the /usr/bin/<executable> link via
# update-alternatives, fix chrome-sandbox) and add our sandbox hardening.
set -e

EXECUTABLE="clinical-rx"
INSTALL_DIR="/opt/ClinicalRx"

# --- 1. Create the /usr/bin/<executable> launcher link (default behavior) ---
if type update-alternatives 2>/dev/null >/dev/null; then
    # Remove a previous plain symlink if it isn't managed by update-alternatives
    if [ -L "/usr/bin/${EXECUTABLE}" ] && [ -e "/usr/bin/${EXECUTABLE}" ] && [ "$(readlink "/usr/bin/${EXECUTABLE}")" != "/etc/alternatives/${EXECUTABLE}" ]; then
        rm -f "/usr/bin/${EXECUTABLE}"
    fi
    update-alternatives --install "/usr/bin/${EXECUTABLE}" "${EXECUTABLE}" "${INSTALL_DIR}/${EXECUTABLE}" 100 || ln -sf "${INSTALL_DIR}/${EXECUTABLE}" "/usr/bin/${EXECUTABLE}"
else
    ln -sf "${INSTALL_DIR}/${EXECUTABLE}" "/usr/bin/${EXECUTABLE}"
fi

# --- 2. chrome-sandbox permissions ---
# Electron's SUID sandbox helper must be root-owned with mode 4755, otherwise
# the app aborts at startup ("SUID sandbox helper binary ... not configured").
# Some kernels support user namespaces (then 0755 works); be conservative and
# set 4755 so it works everywhere.
SANDBOX="${INSTALL_DIR}/chrome-sandbox"
if [ -f "$SANDBOX" ]; then
    chown root:root "$SANDBOX" 2>/dev/null || true
    chmod 4755 "$SANDBOX" 2>/dev/null || true
fi

# --- 3. Refresh desktop / mime databases ---
if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi
if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi

exit 0
