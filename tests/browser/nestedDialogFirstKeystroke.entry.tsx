import { lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Modal from '../../src/shell/Modal';
import { ConfirmProvider } from '../../src/shell/ConfirmDialog';
import { WindowManagerProvider, useWindowManager } from '../../src/shell/WindowManager';
import { setShellWindowRegistry } from '../../src/windowRegistry/types';

const ROUTE = '/browser-nested-dialog-first-keystroke';

// A list window with a create dialog inside it — the shape of every "+ New"
// form a host renders from its own page. The dialog carries no `windowKey`, so
// it reports its dirty state to this page window, and the page re-renders.
function ListPage() {
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <>
      <button type="button" data-testid="new" onClick={() => setCreateOpen(true)}>New</button>
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Record" dirty="auto">
        <CreateForm />
      </Modal>
    </>
  );
}

function CreateForm() {
  const [reference, setReference] = useState('');
  return (
    <input data-testid="reference" aria-label="Reference" value={reference}
      onChange={e => setReference(e.target.value)} />
  );
}

setShellWindowRegistry({
  [ROUTE]: {
    label: 'Nested dialog test',
    component: lazy(() => Promise.resolve({ default: ListPage })),
  },
});

function OpenOnMount() {
  const { openPage } = useWindowManager();
  useEffect(() => { openPage(ROUTE); }, [openPage]);
  return <div id="taskbar-windows" />;
}

localStorage.setItem('access_token', 'browser-nested-dialog-first-keystroke');
localStorage.setItem('erp_open_windows', '[]');

createRoot(document.getElementById('root')!).render(
  <MemoryRouter>
    <ConfirmProvider>
      <WindowManagerProvider>
        <OpenOnMount />
      </WindowManagerProvider>
    </ConfirmProvider>
  </MemoryRouter>,
);
