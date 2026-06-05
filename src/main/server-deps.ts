import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Runtime dependencies needed by the bundled FastAPI sidecar in server/.
// Keep this as the single source of truth for install, verification, and
// server startup gating.
export const SERVER_PYTHON_DEPS: Array<{ spec: string; importName: string }> = [
  { spec: 'fastapi>=0.115.0', importName: 'fastapi' },
  { spec: 'uvicorn[standard]>=0.32.0', importName: 'uvicorn' },
  // python-multipart is the package name, the import is `multipart`.
  { spec: 'python-multipart>=0.0.12', importName: 'multipart' },
  { spec: 'pydantic>=2.0.0', importName: 'pydantic' },
  { spec: 'httpx[http2]>=0.27.0', importName: 'h2' },
];

// Directory where `uv tool install` stores per-tool virtual environments.
// This MUST match uv's own resolution or verification/startup will probe an
// empty path and report "Tool venv missing" even on a healthy install.
//
//   - UV_TOOL_DIR overrides everything (uv reads it directly).
//   - XDG_DATA_HOME, when set, places tools at "$XDG_DATA_HOME/uv/tools".
//   - Windows persistent data dir is "%APPDATA%\uv\data" — note the extra
//     `data` segment — so tools live at "%APPDATA%\uv\data\tools". Omitting
//     `data` is the historical Windows bug that broke fresh-install setups.
//   - Unix default is "~/.local/share/uv/tools".
export function getUvToolsDir(): string {
  if (process.env.UV_TOOL_DIR) return process.env.UV_TOOL_DIR;
  if (process.env.XDG_DATA_HOME) {
    return path.join(process.env.XDG_DATA_HOME, 'uv', 'tools');
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'uv', 'data', 'tools');
  }
  return path.join(os.homedir(), '.local', 'share', 'uv', 'tools');
}

/*
 * uv names the tool venv after the installed package, not the CLI command.
 * The git package (github.com/mindsdb/anton) installs as the `anton-agent`
 * tool — so the interpreter lives under `…/tools/anton-agent/`, even though
 * the CLI entry-point is `anton`. Older installs used the bare `anton` name.
 * Probe both and return whichever actually exists; hardcoding a single name
 * is the historical cause of "Tool venv missing" on a healthy install.
 */
const ANTON_TOOL_NAMES = ['anton-agent', 'anton'];

export function getAntonToolPython(): string {
  const toolsDir = getUvToolsDir();
  const rel = process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
  for (const name of ANTON_TOOL_NAMES) {
    const candidate = path.join(toolsDir, name, rel);
    if (fs.existsSync(candidate)) return candidate;
  }
  /* Fall back to the canonical package name so error logs point somewhere sane. */
  return path.join(toolsDir, ANTON_TOOL_NAMES[0], rel);
}

export function getPythonUtf8Env(): NodeJS.ProcessEnv {
  return {
    PYTHONUTF8: process.env.PYTHONUTF8 || '1',
    PYTHONIOENCODING: process.env.PYTHONIOENCODING || 'utf-8',
  };
}

export function getServerDepsImportScript(): string {
  return SERVER_PYTHON_DEPS
    .map((d) => `import ${d.importName}`)
    .join('; ');
}

export function getServerDepsVerifyScript(): string {
  return SERVER_PYTHON_DEPS.map((d) => (
    `import ${d.importName} as _${d.importName}; ` +
    `print('ok ${d.importName}', getattr(_${d.importName}, '__version__', '?'))`
  )).join(';\n');
}

export function checkPythonImports(
  pythonPath: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number = 4000,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const proc = spawn(
      pythonPath,
      ['-c', getServerDepsImportScript()],
      { env: { ...env, ...getPythonUtf8Env() }, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let resolved = false;
    const timeout = setTimeout(() => {
      if (resolved) return;
      try { proc.kill('SIGTERM'); } catch {}
      finish(false);
    }, timeoutMs);
    const finish = (ok: boolean) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      resolve(ok);
    };
    proc.on('close', (code) => finish(code === 0));
    proc.on('error', () => finish(false));
  });
}
