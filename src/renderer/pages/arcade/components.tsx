// Shared chrome + primitives for the arcade onboarding screens.

import { useEffect, useState, type ReactNode, type CSSProperties } from 'react';
import './arcade.css';

/** Full-screen CRT shell: P1 · centered title · ©2026 MINDSDB. */
export function ArcadeShell({
  title,
  subtitle,
  children,
  hudRight = `©${new Date().getFullYear()} MINDSDB`,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  hudRight?: string;
}) {
  return (
    <div className="arc-root">
      <div className="arc-hud">
        <span className="arc-hud-p1">P1</span>
        <div className="arc-hud-center">
          {title && <div className="arc-hud-title">{title}</div>}
          {subtitle && <div className="arc-hud-sub">&mdash; {subtitle} &mdash;</div>}
        </div>
        <span className="arc-hud-copy">{hudRight}</span>
      </div>
      <div className="arc-stage arc-scroll-fade">{children}</div>
    </div>
  );
}

/** Blinking "PRESS ⏎ TO …" prompt; also binds the Enter key. */
export function PressPrompt({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  useEffect(() => {
    if (disabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      // Don't steal Enter from form fields (inputs handle their own).
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      onPress();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onPress, disabled]);

  return (
    <button type="button" className="arc-press arc-blink" onClick={onPress} disabled={disabled}>
      {label}
    </button>
  );
}

/** Step-wise typewriter; fires onDone after the last character. */
export function Typewriter({
  text,
  speed = 38,
  showCaret = true,
  onDone,
  style,
}: {
  text: string;
  speed?: number;
  showCaret?: boolean;
  onDone?: () => void;
  style?: CSSProperties;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(0);
    const id = setInterval(() => {
      setCount((c) => {
        if (c >= text.length) { clearInterval(id); return c; }
        return c + 1;
      });
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);

  useEffect(() => {
    if (count >= text.length && onDone) {
      const t = setTimeout(onDone, 350);
      return () => clearTimeout(t);
    }
  }, [count, text, onDone]);

  return (
    <span style={style}>
      {text.slice(0, count)}
      {showCaret && <span className="arc-caret" aria-hidden />}
    </span>
  );
}

/** Chunky segmented progress bar. value: 0..1 */
export function PixelProgress({
  value,
  cells = 24,
  style,
}: {
  value: number;
  cells?: number;
  style?: CSSProperties;
}) {
  const lit = Math.round(Math.max(0, Math.min(1, value)) * cells);
  return (
    <div className="arc-bar" style={style} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      {Array.from({ length: cells }, (_, i) => {
        // gradient feel: first 2/3 cyan, then warm, last few hot
        const tone = i >= cells - 4 ? 'hot' : i >= cells - 10 ? 'warm' : '';
        return <div key={i} className={`arc-bar-cell ${i < lit ? `on ${tone}` : ''}`} />;
      })}
    </div>
  );
}

/** Indeterminate marquee progress (single lit block sweeping). */
export function PixelMarquee({ cells = 24, style }: { cells?: number; style?: CSSProperties }) {
  const [pos, setPos] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPos((p) => (p + 1) % (cells + 4)), 90);
    return () => clearInterval(id);
  }, [cells]);
  return (
    <div className="arc-bar" style={style} aria-hidden>
      {Array.from({ length: cells }, (_, i) => {
        const d = pos - i;
        const on = d >= 0 && d < 4; // 4-block comet
        return <div key={i} className={`arc-bar-cell ${on ? 'on' : ''}`} />;
      })}
    </div>
  );
}

/** MEMORY ▰▰▰▱▱-style stat row for the coworker detail panel. */
export function StatBar({
  label,
  value,
  max = 5,
  color,
  unknown = false,
}: {
  label: string;
  value: number;
  max?: number;
  color: string;
  unknown?: boolean;
}) {
  return (
    <div className="arc-stat-row">
      <span className="arc-stat-name">{label}</span>
      <span className="arc-stat-cells" aria-label={unknown ? `${label}: unknown` : `${label}: ${value} of ${max}`}>
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            className={`arc-stat-cell ${i < value && !unknown ? 'on' : ''}`}
            style={i < value && !unknown ? { background: color, boxShadow: `0 0 6px ${color}66` } : undefined}
          >
            {unknown && (
              <span style={{ display: 'block', textAlign: 'center', fontSize: 8, lineHeight: '11px', color: 'var(--arc-dim)' }}>?</span>
            )}
          </span>
        ))}
      </span>
    </div>
  );
}
