// SELECT YOUR COWORKER — the cartridge-select screen.
//
// Same app · the agent is a cartridge. Anton and Hermes are the two
// real harnesses today (settings key `harness`); OpenClaw and ??? are
// visible-but-locked cartridges that telegraph the roadmap. Arrow keys
// or click to browse, Enter to confirm. The choice is handed up to the
// onboarding flow, which persists it alongside the provider settings.

import { useEffect, useRef, useState } from 'react';
import { ArcadeShell, PressPrompt, StatBar } from './components';
import { PixelSprite, type SpriteName } from './sprites';

export interface Coworker {
  id: string;            // harness id ('anton' | 'hermes') for unlocked carts
  name: string;
  tagline: string;
  special: string;
  sprite: SpriteName;
  color: string;
  locked: boolean;
  lockNote?: string;
  stats: { memory: number; artifacts: number; autonomy: number } | null;
}

export const COWORKERS: Coworker[] = [
  {
    id: 'anton',
    name: 'ANTON',
    tagline: 'The full-stack workhorse',
    special: 'SPECIAL: DEEP WORK — plans, codes, and remembers everything.',
    sprite: 'anton',
    color: 'var(--arc-green)',
    locked: false,
    stats: { memory: 4, artifacts: 5, autonomy: 4 },
  },
  {
    id: 'hermes',
    name: 'HERMES',
    tagline: 'The swift messenger',
    special: 'SPECIAL: LIGHTNING TOOLS — independent tools and memory system.',
    sprite: 'hermes',
    color: 'var(--arc-yellow)',
    locked: false,
    stats: { memory: 3, artifacts: 4, autonomy: 4 },
  },
  {
    id: 'openclaw',
    name: 'OPENCLAW',
    tagline: 'The open automator',
    special: 'SPECIAL: WIDE GRIP — automation across every surface.',
    sprite: 'openclaw',
    color: 'var(--arc-red)',
    locked: true,
    lockNote: 'COMING SOON',
    stats: { memory: 4, artifacts: 4, autonomy: 5 },
  },
  {
    id: 'mystery',
    name: '???',
    tagline: 'Data expunged',
    special: 'SPECIAL: ████████ — █████ ███ ████████.',
    sprite: 'mystery',
    color: 'var(--arc-purple)',
    locked: true,
    lockNote: 'TOP SECRET',
    stats: null,
  },
];

export default function CoworkerSelect({
  onSelect,
}: {
  onSelect: (harnessId: string, label: string) => void;
}) {
  const [focus, setFocus] = useState(0);
  const [shakeIdx, setShakeIdx] = useState<number | null>(null);
  const [lockMsg, setLockMsg] = useState('');
  const focused = COWORKERS[focus];
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const confirm = (idx: number) => {
    const cw = COWORKERS[idx];
    if (cw.locked) {
      setShakeIdx(idx);
      setLockMsg(cw.lockNote === 'TOP SECRET'
        ? 'THIS CARTRIDGE IS CLASSIFIED.'
        : 'THIS CARTRIDGE ISN’T OUT YET — PICK ANOTHER COWORKER.');
      if (shakeTimer.current) clearTimeout(shakeTimer.current);
      shakeTimer.current = setTimeout(() => setShakeIdx(null), 350);
      return;
    }
    onSelect(cw.id, cw.name);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { setFocus((f) => (f + 1) % COWORKERS.length); setLockMsg(''); }
      else if (e.key === 'ArrowLeft') { setFocus((f) => (f - 1 + COWORKERS.length) % COWORKERS.length); setLockMsg(''); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => () => { if (shakeTimer.current) clearTimeout(shakeTimer.current); }, []);

  return (
    <ArcadeShell title="SELECT YOUR COWORKER" subtitle="same app · the agent is a cartridge">
      <div className="arc-stack arc-fade-in" style={{ gap: 0, width: '100%' }}>
        <div className="arc-cart-row" role="radiogroup" aria-label="Select your coworker">
          {COWORKERS.map((cw, idx) => {
            const isFocused = idx === focus;
            return (
              <div className="arc-cart-wrap" key={cw.id}>
                {isFocused && (
                  <div className="arc-brackets" style={{ '--cart-color': cw.color } as React.CSSProperties}>
                    <span /><span /><span /><span />
                  </div>
                )}
                <button
                  type="button"
                  role="radio"
                  aria-checked={isFocused}
                  className={`arc-cart${isFocused ? ' focused' : ''}${cw.locked ? ' locked' : ''}${shakeIdx === idx ? ' shake' : ''}`}
                  style={{ '--cart-color': cw.color } as React.CSSProperties}
                  onClick={() => {
                    if (idx !== focus) { setFocus(idx); setLockMsg(''); return; }
                    confirm(idx);
                  }}
                  onDoubleClick={() => confirm(idx)}
                >
                  {cw.locked && <span className="arc-cart-lock">▣ {cw.lockNote}</span>}
                  <PixelSprite name={cw.sprite} size={84} bob={isFocused} title={cw.name} />
                  <span className="arc-cart-name">{cw.name}</span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Detail panel for the focused cartridge */}
        <div
          className="arc-panel arc-cart-detail"
          style={{ '--cart-color': focused.color } as React.CSSProperties}
          key={focused.id}
        >
          <div style={{ textAlign: 'left', minWidth: 0 }}>
            <div className="arc-cart-detail-name">{focused.name}</div>
            <div className="arc-cart-detail-tag">{focused.tagline}</div>
            <div style={{ marginTop: 10, fontSize: 10.5, letterSpacing: '0.06em', lineHeight: 1.6, color: 'var(--arc-dim)' }}>
              {focused.special}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 'none' }}>
            <StatBar label="MEMORY" value={focused.stats?.memory ?? 0} color={cssColor(focused.color)} unknown={!focused.stats} />
            <StatBar label="ARTIFACTS" value={focused.stats?.artifacts ?? 0} color={cssColor(focused.color)} unknown={!focused.stats} />
            <StatBar label="AUTONOMY" value={focused.stats?.autonomy ?? 0} color={cssColor(focused.color)} unknown={!focused.stats} />
          </div>
        </div>

        {lockMsg && (
          <div className="arc-error" role="alert" style={{ maxWidth: 640, marginTop: 18, justifyContent: 'center' }}>
            <span style={{ fontWeight: 700 }}>▣</span>
            <span>{lockMsg}</span>
          </div>
        )}
        <div style={{ marginTop: lockMsg ? 8 : 18, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <PressPrompt
            label={focused.locked ? 'LOCKED' : `PRESS ⏎ TO HIRE ${focused.name}`}
            onPress={() => confirm(focus)}
          />
          <div style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--arc-dim)' }}>
            <span className="arc-kbd">◀</span> <span className="arc-kbd">▶</span> browse &nbsp;·&nbsp; you can switch coworkers anytime in Settings
          </div>
        </div>
      </div>
    </ArcadeShell>
  );
}

// StatBar paints with a concrete colour (box-shadow can't resolve a
// var() inside the rgba helper), so map the var to its hex.
function cssColor(varColor: string): string {
  const map: Record<string, string> = {
    'var(--arc-green)': '#4ade80',
    'var(--arc-yellow)': '#fbbf24',
    'var(--arc-red)': '#f87168',
    'var(--arc-purple)': '#a78bfa',
  };
  return map[varColor] || '#3dd6f5';
}
