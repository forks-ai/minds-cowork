# Cowork web image — cowork-server backend + cowork SPA on the same port.
#
# Two invocations from one Dockerfile:
#
#   Dev (local sibling source — fastest iteration, no GitHub auth needed):
#     cd antonworld/        # parent dir, so cowork-server/ is in build context
#     docker build -f cowork/Dockerfile -t cowork:dev \
#       --build-arg COWORK_SERVER_SOURCE=local .
#
#   Prod (pinned cowork-server version from GitHub):
#     docker build -f cowork/Dockerfile -t ghcr.io/mindsdb/cowork:1.2.3 \
#       --build-arg COWORK_SERVER_SOURCE=git \
#       --build-arg COWORK_SERVER_VERSION=v0.1.0 .
#
# Run:
#     docker run -p 26866:26866 \
#       -e OPENAI_API_KEY=... \
#       -v cowork-data:/home/anton/.cowork \
#       cowork:dev
#
# Then browse to http://localhost:26866 — the SPA wrapper serves
# both the cowork SPA (at /) and the API (at /api/v1/*) on the same port.
#
# Image is split into four build stages so the runtime layer ships only
# what's needed to serve traffic:
#
#   spa-builder              Node + npm — builds the renderer; produces /build/dist/
#   cowork-server-source     scratch    — picks local sibling vs empty (git mode)
#   py-builder               Python +
#                            uv + git   — installs cowork-server into /opt/venv
#   runtime                  Python     — copies /opt/venv + SPA + wrapper.
#                                         NO git, NO source tree.

# Global ARGs — must appear before the first FROM so the
# FROM cowork-server-source-${COWORK_SERVER_SOURCE} substitution resolves.
ARG COWORK_SERVER_SOURCE=git
ARG COWORK_SERVER_VERSION=main

# ── Stage 1: build the cowork SPA ────────────────────────────────────────
FROM node:22-slim AS spa-builder
WORKDIR /build
# Lockfile-only install first → cached layer when only source changes.
COPY cowork/package.json cowork/package-lock.json ./
# --ignore-scripts skips postinstall hooks (e.g. node-gyp rebuilds for
# native modules) — the web SPA has no native dependencies.
RUN npm ci --ignore-scripts
COPY cowork/ ./
RUN npm run build:web
# Output lives at /build/dist/renderer-web/

# ── Stage 2a: cowork-server source = local sibling ───────────────────────
# Used when COWORK_SERVER_SOURCE=local. Build context must be the parent
# directory (e.g. antonworld/) so cowork-server/ is visible.
FROM scratch AS cowork-server-source-local
COPY cowork-server/ /

FROM scratch AS cowork-server-source-git
# Empty: git mode clones inside py-builder.

# Pick the source stage based on COWORK_SERVER_SOURCE (declared at file top).
FROM cowork-server-source-${COWORK_SERVER_SOURCE} AS cowork-server-source

# ── Stage 3: install Python deps into an isolated venv ────────────────────
# This stage carries git because cowork-server's lock file includes git
# dependencies (anton, hermes-agent). Neither git nor uv reach the
# runtime image — only /opt/venv is copied forward.
FROM python:3.12-slim AS py-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        git \
    && rm -rf /var/lib/apt/lists/*

# uv for fast, reproducible installs from the lock file.
COPY --from=ghcr.io/astral-sh/uv:0.7 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# Copy local source (no-op when COWORK_SERVER_SOURCE=git — the scratch
# stage is empty so this just creates /build/cowork-server/).
COPY --from=cowork-server-source / /build/cowork-server/

COPY cowork/scripts/install-cowork-server.sh /tmp/install-cowork-server.sh
ARG COWORK_SERVER_SOURCE
ARG COWORK_SERVER_VERSION
ENV COWORK_SERVER_SOURCE=${COWORK_SERVER_SOURCE} \
    COWORK_SERVER_VERSION=${COWORK_SERVER_VERSION}
RUN chmod +x /tmp/install-cowork-server.sh && /tmp/install-cowork-server.sh

# ── Stage 4: runtime — minimal, no compilers, no git, no source tree ─────
FROM python:3.12-slim AS runtime

# OCI labels — visible in registry UI; helps operators match image to commit.
LABEL org.opencontainers.image.title="cowork"
LABEL org.opencontainers.image.source="https://github.com/mindsdb/cowork"
LABEL org.opencontainers.image.description="Anton Cowork — FastAPI + SPA"

# ca-certificates is the only runtime apt dep. git and uv live
# only in py-builder; dropping them here keeps the runtime CVE surface small.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Run as a non-root user. UID 1000 is the convention for "primary user".
RUN useradd -m -u 1000 -s /bin/bash anton

# Copy the prebuilt venv. Owned by root, world-readable — the venv is
# read-only at runtime.
COPY --from=py-builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# App payload — SPA bundle from the builder + the SPA wrapper entrypoint.
COPY --chown=anton:anton --from=spa-builder /build/dist/renderer-web/ /app/dist/renderer-web/
COPY --chown=anton:anton cowork/scripts/spa_wrapper.py /app/spa_wrapper.py

# Persistent state lives under /home/anton/.cowork — operators bind-mount
# this to keep database/vault/settings across container restarts.
RUN mkdir -p /home/anton/.cowork && chown anton:anton /home/anton/.cowork

USER anton

ENV COWORK_SPA_DIR=/app/dist/renderer-web \
    COWORK_SERVER_HOST=0.0.0.0 \
    COWORK_SERVER_PORT=26866 \
    PYTHONUNBUFFERED=1

EXPOSE 26866

# Plain stdlib healthcheck — no curl needed.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; \
sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:26866/health',timeout=3).status==200 else 1)" \
    || exit 1

CMD ["uvicorn", "spa_wrapper:app", "--host", "0.0.0.0", "--port", "26866"]
