"""
artifact_git — automatic git commits for artifact changes.

Called by the artifact creation/update flow in antontron.
Commits follow the convention:
    artifact(<slug>): <action> — <description>

The module works with the project's existing git repo (if any),
or initializes one at the project root on first use.

Also manages the per-artifact .gitignore file.
"""

from __future__ import annotations

import logging
import re
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

# Files that should never be committed in an artifact folder
GITIGNORE_ENTRIES = [
    ".published.json",
    ".local/",
    "__pycache__/",
    "*.pyc",
    "*.pyo",
    "*.pyd",
    ".DS_Store",
]

# Allow short/full hexadecimal commit ids only (no refs/options/revspec operators)
COMMIT_SHA_RE = re.compile(r"^[0-9a-fA-F]{7,40}$")


def ensure_gitignore(artifact_folder: Path) -> None:
    """Write/update the .gitignore inside the artifact folder."""
    gi_path = artifact_folder / ".gitignore"
    existing_lines: list[str] = []
    if gi_path.is_file():
        existing_lines = gi_path.read_text(encoding="utf-8").splitlines()

    added = False
    for entry in GITIGNORE_ENTRIES:
        if entry not in existing_lines:
            existing_lines.append(entry)
            added = True

    if added or not gi_path.is_file():
        gi_path.write_text("\n".join(existing_lines) + "\n", encoding="utf-8")
        logger.debug("Updated .gitignore for %s", artifact_folder.name)


def _find_git_root(start: Path) -> Path | None:
    """Walk up from start to find a .git directory."""
    p = start.resolve()
    while p != p.parent:
        if (p / ".git").is_dir():
            return p
        p = p.parent
    return None


def _git(args: list[str], cwd: Path) -> tuple[int, str]:
    result = subprocess.run(
        ["git"] + args,
        cwd=str(cwd),
        capture_output=True,
        text=True,
    )
    return result.returncode, (result.stdout + result.stderr).strip()


def _ensure_repo(project_dir: Path) -> Path:
    """Ensure a git repo exists at or above project_dir. Init if needed."""
    root = _find_git_root(project_dir)
    if root:
        return root
    # Init at project dir
    rc, out = _git(["init"], cwd=project_dir)
    if rc != 0:
        raise RuntimeError(f"git init failed: {out}")
    # Initial config if not set
    _git(["config", "user.email", "anton@local"], cwd=project_dir)
    _git(["config", "user.name", "Anton"], cwd=project_dir)
    logger.info("Initialized git repo at %s", project_dir)
    return project_dir


def commit(
    artifact_folder: Path,
    slug: str,
    action: str,
    description: str,
    project_dir: Path | None = None,
) -> bool:
    """
    Stage all changes in artifact_folder and commit.

    artifact_folder: absolute path to .anton/artifacts/<slug>/
    slug:            artifact slug (for commit message)
    action:          verb (create, update, publish, migrate, rollback)
    description:     one-line summary

    Returns True if a commit was made, False if nothing to commit.
    """
    try:
        ensure_gitignore(artifact_folder)

        root = _ensure_repo(project_dir or artifact_folder.parents[3])

        # Stage everything in the artifact folder
        rel = str(artifact_folder.relative_to(root))
        rc, out = _git(["add", rel], cwd=root)
        if rc != 0:
            logger.warning("git add failed: %s", out)
            return False

        # Check if there is anything to commit
        rc, status = _git(["status", "--porcelain", rel], cwd=root)
        if not status.strip():
            logger.debug("Nothing to commit for %s", slug)
            return False

        message = f"artifact({slug}): {action} — {description}"
        rc, out = _git(["commit", "-m", message], cwd=root)
        if rc != 0:
            logger.warning("git commit failed: %s", out)
            return False

        logger.info("Committed: %s", message)
        return True

    except Exception as e:
        # Git failures are non-fatal — never break the main workflow
        logger.warning("artifact_git.commit failed silently: %s", e)
        return False


def rollback(
    artifact_folder: Path,
    slug: str,
    commit_sha: str,
    project_dir: Path | None = None,
) -> bool:
    """
    Restore the artifact folder to a specific commit SHA.
    Does NOT redeploy — caller decides whether to re-publish.
    Returns True on success.
    """
    try:
        if not COMMIT_SHA_RE.fullmatch(commit_sha):
            raise ValueError("Invalid commit SHA format")

        root = _find_git_root(project_dir or artifact_folder.parents[3])
        if not root:
            raise RuntimeError("No git repo found")

        rel = str(artifact_folder.relative_to(root))
        rc, out = _git(["checkout", commit_sha, "--", rel], cwd=root)
        if rc != 0:
            raise RuntimeError(f"git checkout failed: {out}")

        logger.info("Rolled back %s to %s", slug, commit_sha[:8])
        return True
    except Exception as e:
        logger.error("artifact_git.rollback failed: %s", e)
        return False


def log(
    artifact_folder: Path,
    project_dir: Path | None = None,
    max_entries: int = 20,
) -> list[dict]:
    """Return commit history for this artifact folder as a list of dicts."""
    try:
        root = _find_git_root(project_dir or artifact_folder.parents[3])
        if not root:
            return []
        rel = str(artifact_folder.relative_to(root))
        rc, out = _git(
            ["log", f"-{max_entries}", "--pretty=format:%H|%ai|%s", "--", rel],
            cwd=root,
        )
        if rc != 0 or not out.strip():
            return []
        entries = []
        for line in out.strip().splitlines():
            parts = line.split("|", 2)
            if len(parts) == 3:
                entries.append({"sha": parts[0], "date": parts[1], "message": parts[2]})
        return entries
    except Exception as e:
        logger.warning("artifact_git.log failed: %s", e)
        return []


def push(project_dir: Path, remote: str = "origin", branch: str = "HEAD") -> bool:
    """Push to GitHub remote. Returns True on success."""
    try:
        root = _find_git_root(project_dir)
        if not root:
            return False
        rc, out = _git(["push", remote, branch], cwd=root)
        if rc != 0:
            logger.warning("git push failed: %s", out)
            return False
        logger.info("Pushed to %s %s", remote, branch)
        return True
    except Exception as e:
        logger.warning("artifact_git.push failed: %s", e)
        return False
