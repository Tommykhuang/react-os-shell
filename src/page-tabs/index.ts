/**
 * `react-os-shell/page-tabs` — open pages as tabs, for a routed app.
 *
 * The desktop gives every record its own window, so several can be open at
 * once and each keeps its place. A portal that swapped the desktop for plain
 * routed pages (a sidebar, a header, one page at a time) loses that: opening a
 * record replaces the list it came from. This entry puts it back in the shape
 * admin dashboards use — a strip of tabs under the header, one per page
 * opened, with the pages behind the other tabs kept alive.
 *
 *     <PageTabsProvider key={user.id} storageKey={`tabs:u${user.id}`}
 *                       resolve={tabForRoute} pinned={['/dashboard']}>
 *       <Header />
 *       <PageTabBar />
 *       <PageTabsOutlet frameClassName="min-h-0 flex-1 overflow-y-auto p-6">
 *         {(location) => <Routes location={location}>{contentRoutes}</Routes>}
 *       </PageTabsOutlet>
 *     </PageTabsProvider>
 *
 * Its own entry, not part of `react-os-shell/ui`: it needs react-router-dom,
 * and the kit promises React alone. It needs none of the window manager
 * either, so an app built on the kit can take it without the desktop.
 */
export { default as PageTabsProvider, parseTabPath } from './PageTabsProvider';
export type { PageTabsProviderProps } from './PageTabsProvider';
export { default as PageTabsOutlet, PAGE_TABS_PAUSE_HIDDEN } from './PageTabsOutlet';
export type { PageTabsOutletProps } from './PageTabsOutlet';
export { default as PageTabBar } from './PageTabBar';
export type { PageTabBarProps } from './PageTabBar';
export { usePageTabs, usePageTab, usePageTabTitle, usePageTabDirty } from './hooks';
export type { PageTabsApi, PageTabHandle } from './hooks';
export type { PageTabRoute, ResolvePageTab, TabLocation, CloseTabOptions } from './context';
export type { PageTab } from './tabsModel';
export { DEFAULT_MAX_TABS } from './tabsModel';
