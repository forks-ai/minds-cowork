// Title screen — the first thing a brand-new user sees (plays only
// until terms are accepted, same gate as the old IntroSequence).
//
//   1. CRT power-on flash (700ms)
//   2. "MINDSDB PRESENTS" typewriter
//   3. COWORK logo + tagline + the cast walks on
//   4. blinking PRESS ⏎ TO START
//
// Any click or Enter skips straight to the end state; a second
// Enter/click advances. No forced sit-through.

import { useEffect, useState } from 'react';
import { ArcadeShell, PressPrompt, Typewriter } from './components';
import { PixelSprite } from './sprites';

type Stage = 'on' | 'presents' | 'title';

export default function TitleScreen({ onComplete }: { onComplete: () => void }) {
  const [stage, setStage] = useState<Stage>('on');

  useEffect(() => {
    if (stage === 'on') {
      const t = setTimeout(() => setStage('presents'), 750);
      return () => clearTimeout(t);
    }
  }, [stage]);

  // Click anywhere fast-forwards the intro beats to the title.
  const skipToTitle = () => setStage((s) => (s === 'title' ? s : 'title'));

  // Enter (or Space/Esc) during the intro beats also fast-forwards.
  useEffect(() => {
    if (stage === 'title') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') skipToTitle();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [stage]);

  return (
    <div onClick={stage !== 'title' ? skipToTitle : undefined}>
      <ArcadeShell>
        <div className={stage === 'on' ? 'arc-crt-on' : undefined} style={{ width: '100%' }}>
          {stage === 'presents' && (
            <div className="arc-stack" style={{ gap: 8, minHeight: 320, justifyContent: 'center' }}>
              <Typewriter
                text="MINDSDB PRESENTS"
                speed={55}
                onDone={() => setTimeout(() => setStage('title'), 600)}
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  letterSpacing: '0.3em',
                  color: 'var(--arc-muted)',
                }}
              />
            </div>
          )}

          {(stage === 'on' || stage === 'title') && (
            <div className="arc-stack" style={{ gap: 0 }}>
              <div className={stage === 'title' ? 'arc-fade-in' : undefined}>
                <div className="arc-title-logo">COWORK</div>
                <div className="arc-title-rule" />
              </div>

              <div className="arc-tagline arc-fade-in" style={{ marginTop: 30, animationDelay: '120ms' }}>
                ONE APP. ANY AGENT.
              </div>

              <div
                className="arc-fade-in"
                style={{ display: 'flex', gap: 26, marginTop: 38, alignItems: 'flex-end', animationDelay: '240ms' }}
              >
                <PixelSprite name="anton" size={52} bob title="Anton" />
                <PixelSprite name="hermes" size={52} bob title="Hermes" style={{ animationDelay: '0.4s' }} />
                <PixelSprite name="openclaw" size={52} bob title="OpenClaw" style={{ animationDelay: '0.8s' }} />
                <PixelSprite name="mystery" size={52} bob title="???" style={{ animationDelay: '1.2s' }} />
              </div>

              <div
                className="arc-fade-in"
                style={{
                  marginTop: 34,
                  fontSize: 11,
                  letterSpacing: '0.12em',
                  color: 'var(--arc-dim)',
                  animationDelay: '360ms',
                }}
              >
                ⌘ macOS &nbsp;&middot;&nbsp; ⊞ Windows &nbsp;&middot;&nbsp; open source &mdash; github.com/mindsdb/cowork
              </div>

              <div style={{ marginTop: 36 }}>
                <PressPrompt label="PRESS ⏎ TO START" onPress={onComplete} />
              </div>
            </div>
          )}
        </div>
      </ArcadeShell>
    </div>
  );
}
