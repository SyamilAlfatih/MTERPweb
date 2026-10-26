import React, { Suspense } from 'react';
import { Routes } from 'react-router-dom';
import { useTabs, TabContextProvider } from '../../contexts/TabsContext';
import { renderProtectedRoutes } from '../../routes/appRoutes';
import { ErrorBoundary } from '../shared';

function TabPageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[400px] p-8">
      <div className="flex flex-col items-center gap-3">
        <div className="w-9 h-9 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin" />
        <span className="text-xs font-bold text-text-muted uppercase tracking-widest">Memuat Halaman...</span>
      </div>
    </div>
  );
}

export default function TabbedOutlet() {
  const { tabs, activeTabId } = useTabs();

  return (
    <div className="relative flex-1 flex flex-col min-w-0 w-full min-h-0">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;

        return (
          <div
            key={tab.id}
            id={`tab-pane-${tab.id}`}
            role="tabpanel"
            aria-labelledby={`tab-${tab.id}`}
            aria-hidden={!isActive}
            style={{ display: isActive ? 'flex' : 'none' }}
            className="flex-1 flex-col min-w-0 w-full min-h-0"
          >
            <TabContextProvider value={{ tabId: tab.id, isActive }}>
              <ErrorBoundary>
                <Suspense fallback={<TabPageLoader />}>
                  <Routes location={tab.path}>
                    {renderProtectedRoutes()}
                  </Routes>
                </Suspense>
              </ErrorBoundary>
            </TabContextProvider>
          </div>
        );
      })}
    </div>
  );
}
