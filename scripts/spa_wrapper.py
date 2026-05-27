"""Docker entrypoint — wraps cowork-server with SPA static-file serving.

In the Docker image, the same FastAPI process serves both:
  /api/v1/*  — cowork-server API endpoints
  /          — cowork SPA (single-page app with client-side routing)

This wrapper imports the cowork-server app and adds SPA routes on top.
Run with: uvicorn spa_wrapper:app --host 0.0.0.0 --port 26866
"""

import os
from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from cowork.server import app  # noqa: F401 — re-exported for uvicorn

SPA_DIR = Path(os.environ.get("COWORK_SPA_DIR", "/app/dist/renderer-web"))

if SPA_DIR.exists():
    # Subdirectories that the SPA build emits — served by StaticFiles so
    # they get correct MIME-types and range-request handling for free.
    for _sub in ("assets", "fonts", "gravity-field", "logos"):
        _sub_path = SPA_DIR / _sub
        if _sub_path.exists():
            app.mount(
                f"/{_sub}",
                StaticFiles(directory=str(_sub_path)),
                name=f"spa-{_sub}",
            )

    # Pre-resolve every top-level file in SPA_DIR into a string→Path
    # allowlist. The fallback handler uses full_path only as a dict key,
    # never as a path component, so traversal sequences simply miss the
    # dict and fall through to the SPA shell.
    _spa_files: dict[str, Path] = {
        entry.name: entry for entry in SPA_DIR.iterdir() if entry.is_file()
    }
    _spa_shell: Path = SPA_DIR / "index-web.html"

    @app.get("/health")
    async def health_compat():
        """Compat endpoint — proxies to /api/v1/health for callers that probe /health."""
        from cowork.api.v1.endpoints.health import health

        return health()

    @app.get("/")
    async def root():
        return FileResponse(str(_spa_shell))

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        # /api/* paths must 404 cleanly — never serve the SPA shell in
        # place of a missing API endpoint.
        if full_path.startswith("api/") or full_path == "api":
            raise HTTPException(status_code=404)
        # Top-level file the build emitted? Serve it. Otherwise this is
        # a client-side route — serve the SPA shell so the renderer's
        # router can take over.
        served = _spa_files.get(full_path)
        if served is not None:
            return FileResponse(str(served))
        return FileResponse(str(_spa_shell))
