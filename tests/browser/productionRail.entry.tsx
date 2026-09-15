import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ProductionTimeline, {
  useProductionTimeline,
  type ProgressItem,
  type TimelineMarker,
  type TimelineReport,
} from '../../src/shell/ProductionTimeline';

/**
 * The production rail under a stepper, as the customer order window draws it:
 * seven reports over a twenty-month window, two shipments, two invoices, one
 * inspection, and an estimate still ahead. `?theme=dark` stamps the kit's
 * dark attribute.
 */
const params = new URLSearchParams(location.search);
const dark = params.get('theme') === 'dark';
if (dark) document.documentElement.setAttribute('data-theme', 'dark');
document.body.style.background = dark ? '#1e1e2e' : '#ffffff';
document.body.style.padding = '24px';

const part = (n: number): ProgressItem => ({
  id: `pn-${n}`, part_number: `AN-${n}`, description: 'Alloy wheel',
  order_qty: 200, casting: 200, cnc: 40 * n, painting: 30 * n, packing: 20 * n,
  finished_goods: 10 * n, stock_qty: 5 * n,
});
const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

/** Newest first, as the hook requires. The first three are days apart. */
const REPORTS: TimelineReport[] = [
  { id: 'r7', progress_number: 'PP#7', date: '2026-08-20', items: [part(7)] },
  { id: 'r6', progress_number: 'PP#6', date: '2026-05-02', items: [part(6)] },
  { id: 'r5', progress_number: 'PP#5', date: '2025-06-14', items: [part(5)] },
  { id: 'r4', progress_number: 'PP#4', date: '2025-03-03', items: [part(4)] },
  { id: 'r3', progress_number: 'PP#3', date: '2025-01-11', items: [part(3)] },
  { id: 'r2', progress_number: 'PP#2', date: '2025-01-03', items: [part(2)] },
  { id: 'r1', progress_number: 'PP#1', date: '2024-12-23', items: [part(1)] },
];
const MARKERS: TimelineMarker[] = [
  { id: 'gi-1', date: '2025-01-27', kind: 'shipment', label: 'PL#28380', detail: '668 pcs' },
  { id: 'ci-1', date: '2025-01-14', kind: 'invoice', label: 'CI#51581', detail: '668 · 49,268.00 USD' },
  { id: 'gi-2', date: '2025-02-10', kind: 'shipment', label: 'PL#28402', detail: '672 pcs' },
  { id: 'ci-2', date: '2025-01-25', kind: 'invoice', label: 'CI#51533', detail: '672 · 51,828.00 USD' },
  { id: 'qc-1', date: '2025-04-08', kind: 'inspection', label: 'QC#4471', detail: '20/20 pass' },
];

function Page() {
  const [view, setView] = useState<'order' | 'production'>('order');
  const snapshot = useProductionTimeline({
    reports: REPORTS,
    poProductionStartDate: '2024-11-09',
    poEstCompletionDate: day(45),
    poStatus: 'in_production',
    poNumber: 'SO#24012',
    markers: MARKERS,
  });
  return (
    <div style={{ width: 900 }}>
      <div data-testid="view" data-view={view} style={{ fontSize: 12, marginBottom: 8 }}>Items view: {view}</div>
      <div data-testid="rail">
        <ProductionTimeline
          snapshot={snapshot}
          variant="rail"
          onPickReport={() => {}}
          onPlayStart={() => setView('production')}
          reportLabel={() => 'Production report'}
          resetLabel="Back to latest"
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Page />);
