import { useEffect, useState, version } from 'react';
import { createRoot } from 'react-dom/client';
import BulkImportGrid from '../../src/shell/BulkImportGrid';
import EditableGrid, { type GridColumn } from '../../src/shell/EditableGrid';

const COLUMNS: GridColumn[] = [
  { key: 'part', title: 'Part', width: 160, readOnly: true },
  { key: 'casting', title: 'Casting', width: 100 },
  { key: 'cnc', title: 'CNC', width: 100 },
];

function BrowserGridPage() {
  const [data, setData] = useState<string[][]>(() => [1, 2, 3, 4].map(n => [`PN-${n}`, '', '']));
  // While switched on, the page re-renders on a timer — and the grid with it —
  // the way a host form does when it runs a debounced check on what is typed.
  const [ticking, setTicking] = useState(false);
  const [ticks, setTicks] = useState(0);
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setTicks(n => n + 1), 50);
    return () => clearInterval(timer);
  }, [ticking]);
  const bulk = new URLSearchParams(location.search).get('mode') === 'bulk';

  return (
    <div style={{ padding: 16 }}>
      <span data-testid="react-version">{version}</span>
      <span data-testid="ticks">{ticks}</span>
      <button type="button" data-testid="ticking" onClick={() => setTicking(on => !on)}>
        Re-render
      </button>
      {bulk ? (
        <BulkImportGrid
          columns={[{ key: 'pn', title: 'PN', width: 150 }, { key: 'qty', title: 'Qty', width: 100 }]}
          onImport={async () => {}}
          onCancel={() => {}}
        />
      ) : (
        <EditableGrid columns={COLUMNS} data={data} onChange={setData} fixedRows />
      )}
      <button type="button" data-testid="elsewhere">Elsewhere</button>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<BrowserGridPage />);
