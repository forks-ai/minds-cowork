#!/usr/bin/env bash
# Install the cowork-server Python package inside a Docker build.
#
# COWORK_SERVER_SOURCE controls where to fetch from:
#   local — use the sibling cowork-server/ source tree (build context must be
#           the parent directory so cowork-server/ is visible).
#   git   — clone from mindsdb/cowork-server via HTTPS.
#
# COWORK_SERVER_VERSION (git mode only): branch, tag, or SHA. Defaults to `main`.
#
# The lock file (uv.lock) pins all dependencies including anton and
# hermes-agent, so there is no separate ANTON_VERSION knob — update
# cowork-server's lock to change the anton pin.

set -euo pipefail

SOURCE="${COWORK_SERVER_SOURCE:-git}"
VERSION="${COWORK_SERVER_VERSION:-main}"

case "$SOURCE" in
  local)
    if [ ! -f /build/cowork-server/pyproject.toml ]; then
      echo "✗ COWORK_SERVER_SOURCE=local but /build/cowork-server/pyproject.toml not found." >&2
      echo "  Run \`docker build\` from the parent directory so cowork-server/" >&2
      echo "  is part of the build context." >&2
      exit 1
    fi
    echo "→ Installing cowork-server from local source at /build/cowork-server" >&2
    ;;
  git)
    echo "→ Cloning cowork-server@${VERSION} from GitHub" >&2
    git clone --depth 1 -b "${VERSION}" \
      https://github.com/mindsdb/cowork-server.git /build/cowork-server
    ;;
  *)
    echo "✗ Unknown COWORK_SERVER_SOURCE='${SOURCE}'. Expected 'local' or 'git'." >&2
    exit 1
    ;;
esac

cd /build/cowork-server

# Install into /opt/venv using the lock file for reproducibility.
# --no-editable ensures package files are copied into site-packages
# (not symlinked to source), since source won't exist in the runtime image.
UV_PROJECT_ENVIRONMENT=/opt/venv uv sync --frozen --no-dev --no-editable

# Sanity-check: confirm the cowork server app can be imported.
/opt/venv/bin/python -c "from cowork.server import app; print('✓ cowork-server installed.')"
