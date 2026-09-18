import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import MilestoneTimeline, { type Milestone } from '../../src/shell/MilestoneTimeline';

/**
 * The rail variant under the stepper it was designed for, wired both ways.
 *
 * `?width=` sets the card width (720 by default), `?theme=dark` stamps the
 * kit's dark attribute, `?finished=1` gives the mould a production-ready date
 * so the finished shape — no tail, no cap, no today — renders too.
 */
const params = new URLSearchParams(location.search);
const width = Number(params.get('width') ?? 720);
const dark = params.get('theme') === 'dark';
const finished = params.get('finished') === '1';
if (dark) document.documentElement.setAttribute('data-theme', 'dark');
document.body.style.background = dark ? '#1e1e2e' : '#ffffff';
document.body.style.padding = '24px';

/**
 * Mould 314/20P1, as the customer portal passes it: four revisions inside
 * three weeks, a fifth the day after the drawing was confirmed, a sixth ten
 * months later, a sample ORDERED but not shipped, and no production-ready date.
 */
const MOULD: Milestone[] = [
  { key: 'initiation', label: 'Project Initiated', date: '2025-06-10', glyph: 'flag' },
  { key: 'dfm-1', label: 'DFM v1', date: '2025-07-03', kind: 'dfm', caption: 'v1' },
  { key: 'dfm-2', label: 'DFM v2', date: '2025-07-10', kind: 'dfm', caption: 'v2' },
  { key: 'dfm-3', label: 'DFM v3', date: '2025-07-17', kind: 'dfm', caption: 'v3' },
  { key: 'dfm-4', label: 'DFM v4', date: '2025-07-24', kind: 'dfm', caption: 'v4' },
  { key: 'dfm_confirmed', label: 'DFM Confirmed', date: '2025-07-29', glyph: 'doc' },
  { key: 'dfm-5', label: 'DFM v5', date: '2025-07-30', kind: 'dfm', caption: 'v5' },
  { key: 'mould_complete', label: 'Mould Complete', date: '2025-10-08', kind: 'completion' },
  { key: 'dfm-6', label: 'DFM v6', date: '2026-08-25', kind: 'dfm', caption: 'v6' },
  { key: 'sample_shipped', label: 'Sample ordered', date: '2026-09-09', kind: 'shipment', provisional: true },
  { key: 'production_ready', label: 'Production Ready', date: finished ? '2026-09-12' : null, kind: 'completion' },
];

/** The stepper's steps, and the stretch of the rail each one stands for. */
const STEPS: { key: string; label: string; keys: string[] }[] = [
  { key: 'submitted', label: 'Submitted', keys: ['initiation'] },
  { key: 'engineering', label: 'Design for Manufacturing', keys: ['dfm-1', 'dfm_confirmed'] },
  { key: 'mould_production', label: 'Mould Production', keys: ['dfm_confirmed', 'mould_complete'] },
  { key: 'safety_tests', label: 'Safety Tests', keys: ['mould_complete', 'sample_shipped'] },
  { key: 'sample_shipped', label: 'Sample Shipped', keys: ['sample_shipped'] },
  { key: 'production_ready', label: 'Production Ready', keys: ['production_ready'] },
];
const stepOf = (key: string | null) =>
  key === null ? null : STEPS.find((step) => step.keys.includes(key) || (key.startsWith('dfm-') && step.key === 'engineering'))?.key ?? null;

function Page() {
  const [hoveredStep, setHoveredStep] = useState<string | null>(null);
  const [litStep, setLitStep] = useState<string | null>(null);
  const highlight = STEPS.find((step) => step.key === hoveredStep)?.keys ?? null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width }}>
      <div data-testid="stepper" style={{ display: 'flex', gap: 8 }}>
        {STEPS.map((step) => (
          <button key={step.key} type="button" data-step={step.key}
            data-lit={litStep === step.key ? 'true' : 'false'}
            style={{
              flex: 1, padding: '6px 4px', fontSize: 11, borderRadius: 8, border: '1px solid #cbd5e1',
              background: litStep === step.key || hoveredStep === step.key ? '#dbeafe' : 'transparent',
            }}
            onMouseEnter={() => setHoveredStep(step.key)}
            onMouseLeave={() => setHoveredStep(null)}
            onFocus={() => setHoveredStep(step.key)}
            onBlur={() => setHoveredStep(null)}>
            {step.label}
          </button>
        ))}
      </div>
      <div data-testid="rail">
        <MilestoneTimeline
          title="Mould development for 314/20P1"
          variant="rail"
          milestones={MOULD}
          endDate={finished ? '2026-09-12' : '2026-09-15'}
          edgeCaptions={{ start: 'Start', end: 'Ready' }}
          highlightKeys={highlight}
          onHoverChange={(key) => setLitStep(stepOf(key))}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Page />);
