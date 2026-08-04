#!/bin/bash
# electron-builder "afterInstall" hook for the .deb package.
#
# IMPORTANT:
# 1. A custom afterInstall script REPLACES electron-builder's default
#    after-install.tpl, so this must also create the /usr/bin/<executable>
#    launcher link (update-alternatives) that the default would create.
# 2. electron-builder pre-processes this file and ONLY supports two template
#    macros: 'executable' and 'sanitizedProductName' (lowercase). Any other
#    dollar-brace sequence fails the build with "Macro X is not defined", so
#    the shell variables below are referenced WITHOUT braces ($EXEC).
set -e

EXEC=${executable}
INSTALL_DIR="/opt/${sanitizedProductName}"

# --- 1. Create the /usr/bin/<executable> launcher link (default behavior) ---
if type update-alternatives 2>/dev/null >/dev/null; then
    # Remove a previous plain symlink if it isn't managed by update-alternatives
    if [ -L "/usr/bin/$EXEC" ] && [ -e "/usr/bin/$EXEC" ] && [ "$(readlink "/usr/bin/$EXEC")" != "/etc/alternatives/$EXEC" ]; then
        rm -f "/usr/bin/$EXEC"
    fi
    update-alternatives --install "/usr/bin/$EXEC" "$EXEC" "$INSTALL_DIR/$EXEC" 100 || ln -sf "$INSTALL_DIR/$EXEC" "/usr/bin/$EXEC"
else
    ln -sf "$INSTALL_DIR/$EXEC" "/usr/bin/$EXEC"
fi

# --- 2. chrome-sandbox permissions ---
# Electron's SUID sandbox helper must be root-owned with mode 4755, otherwise
# the app aborts at startup ("SUID sandbox helper binary ... not configured").
SANDBOX="$INSTALL_DIR/chrome-sandbox"
if [ -f "$SANDBOX" ]; then
    chown root:root "$SANDBOX" 2>/dev/null || true
    chmod 4755 "$SANDBOX" 2>/dev/null || true
fi

# --- 3. Refresh desktop / mime databases (so the launcher icon shows) ---
if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi
if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi

exit 0
