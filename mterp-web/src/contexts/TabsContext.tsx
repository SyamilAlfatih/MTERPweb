import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getRouteMetadata } from '../routes/appRoutes';

export interface Tab {
  id: string;
  path: string;
  title: string;
  pinned?: boolean;
  dirty?: boolean;
  lastAccessed: number;
}

interface OpenTabOptions {
  title?: string;
  background?: boolean;
}

interface TabsContextType {
  tabs: Tab[];
  activeTabId: string;
  activeTab: Tab | undefined;
  openTab: (path: string, options?: OpenTabOptions) => void;
  closeTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  closeTabsToRight: (id: string) => void;
  switchTab: (id: string) => void;
  reorderTabs: (startIndex: number, endIndex: number) => void;
  setTabTitle: (idOrPath: string, title: string) => void;
  setTabDirty: (id: string, isDirty: boolean) => void;
  togglePinTab: (id: string) => void;
}

const TabsContext = createContext<TabsContextType | undefined>(undefined);

// Per-tab context for child components
interface TabContextValue {
  tabId: string;
  isActive: boolean;
}

const TabContext = createContext<TabContextValue>({
  tabId: '',
  isActive: true,
});

export const TabContextProvider = TabContext.Provider;

const SESSION_STORAGE_KEY = 'mterp_tabs_session_v1';
const MAX_TABS = 10;
const IDLE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

function generateTabId(path: string): string {
  const clean = path.split('?')[0].replace(/^\//, '').replace(/\//g, '_') || 'home';
  return `tab_${clean}_${Date.now()}`;
}

export const TabsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const currentPathWithSearch = `${location.pathname}${location.search}`;

  // Initialize tabs from sessionStorage or current location
  const [tabs, setTabs] = useState<Tab[]>(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
          return parsed.tabs;
        }
      }
    } catch {
      // ignore
    }

    const { title } = getRouteMetadata(location.pathname, (k, d) => t(k, d));
    const initialId = generateTabId(location.pathname);
    return [
      {
        id: initialId,
        path: currentPathWithSearch || '/home',
        title: title || 'Home',
        lastAccessed: Date.now(),
      },
    ];
  });

  const [activeTabId, setActiveTabId] = useState<string>(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.activeTabId && parsed.tabs?.some((t: Tab) => t.id === parsed.activeTabId)) {
          return parsed.activeTabId;
        }
      }
    } catch {
      // ignore
    }
    return tabs[0]?.id || 'tab_home';
  });

  // Keep a ref to current tabs & activeTabId to avoid stale closures in callbacks
  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef(activeTabId);

  useEffect(() => {
    tabsRef.current = tabs;
    activeTabIdRef.current = activeTabId;
  }, [tabs, activeTabId]);

  // Persist to sessionStorage whenever tabs or activeTabId changes
  useEffect(() => {
    try {
      sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          tabs,
          activeTabId,
        })
      );
    } catch {
      // ignore
    }
  }, [tabs, activeTabId]);

  // Sync tabs with browser location whenever the user navigates
  useEffect(() => {
    const isAuthRoute = location.pathname === '/' || location.pathname === '/register';
    if (isAuthRoute) return;

    const existingTabs = tabsRef.current;
    const currentActiveId = activeTabIdRef.current;
    const activeTab = existingTabs.find((t) => t.id === currentActiveId);

    // 1. Is the active tab already on this exact path?
    if (activeTab && activeTab.path === currentPathWithSearch) {
      return;
    }

    // 2. Does ANOTHER tab already have this route path?
    const cleanLocation = location.pathname;
    const matchingTab = existingTabs.find((t) => {
      const cleanTabPath = t.path.split('?')[0];
      return cleanTabPath === cleanLocation;
    });

    if (matchingTab) {
      // Switch to that existing tab
      setActiveTabId(matchingTab.id);
      setTabs((prev) =>
        prev.map((t) =>
          t.id === matchingTab.id
            ? { ...t, path: currentPathWithSearch, lastAccessed: Date.now() }
            : t
        )
      );
      return;
    }

    // 3. Is the user navigating within the same base page on active tab?
    // (e.g. changing query params like ?tab=... or ?filter=...)
    if (activeTab && activeTab.path.split('?')[0] === cleanLocation) {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === currentActiveId
            ? { ...t, path: currentPathWithSearch, lastAccessed: Date.now() }
            : t
        )
      );
      return;
    }

    // 4. It's a new route! Open a NEW tab automatically so multitasking works seamlessly!
    const { title } = getRouteMetadata(location.pathname, (k, d) => t(k, d));
    const newTabId = generateTabId(location.pathname);
    const newTab: Tab = {
      id: newTabId,
      path: currentPathWithSearch,
      title: title || 'Page',
      lastAccessed: Date.now(),
    };

    setTabs((prev) => {
      const next = [...prev];
      if (next.length >= MAX_TABS) {
        // Evict oldest unpinned, non-dirty, non-active tab
        const evictIdx = next
          .map((tab, idx) => ({ ...tab, idx }))
          .filter((tab) => !tab.pinned && !tab.dirty && tab.id !== currentActiveId)
          .sort((a, b) => a.lastAccessed - b.lastAccessed)[0]?.idx;

        if (evictIdx !== undefined) {
          next.splice(evictIdx, 1);
        }
      }
      return [...next, newTab];
    });
    setActiveTabId(newTabId);
  }, [location.pathname, location.search, currentPathWithSearch, t]);

  // Clear tabs on auth:unauthorized
  useEffect(() => {
    const handleLogout = () => {
      try {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      } catch {
        // ignore
      }
    };
    window.addEventListener('auth:unauthorized', handleLogout);
    return () => window.removeEventListener('auth:unauthorized', handleLogout);
  }, []);

  const switchTab = useCallback(
    (id: string) => {
      const target = tabsRef.current.find((t) => t.id === id);
      if (!target) return;

      setActiveTabId(id);
      setTabs((prev) =>
        prev.map((tab) => (tab.id === id ? { ...tab, lastAccessed: Date.now() } : tab))
      );

      // Navigate outer browser location if different
      if (window.location.pathname + window.location.search !== target.path) {
        navigate(target.path);
      }
    },
    [navigate]
  );

  const openTab = useCallback(
    (path: string, options?: OpenTabOptions) => {
      const existingTabs = tabsRef.current;
      // Deduplicate exact paths
      const existingIndex = existingTabs.findIndex((t) => t.path === path);
      if (existingIndex !== -1) {
        if (!options?.background) {
          switchTab(existingTabs[existingIndex].id);
        }
        return;
      }

      // Check max cap (10)
      const nextTabs = [...existingTabs];
      if (nextTabs.length >= MAX_TABS) {
        // Evict oldest unpinned, non-dirty, non-active tab
        const currentActive = activeTabIdRef.current;
        const evictCandidates = nextTabs
          .map((tab, idx) => ({ ...tab, idx }))
          .filter((tab) => !tab.pinned && !tab.dirty && tab.id !== currentActive)
          .sort((a, b) => a.lastAccessed - b.lastAccessed);

        if (evictCandidates.length > 0) {
          const removeIdx = evictCandidates[0].idx;
          nextTabs.splice(removeIdx, 1);
        } else {
          // If all are pinned/dirty, remove oldest non-active
          const fallbackCandidates = nextTabs
            .map((tab, idx) => ({ ...tab, idx }))
            .filter((tab) => tab.id !== currentActive)
            .sort((a, b) => a.lastAccessed - b.lastAccessed);
          if (fallbackCandidates.length > 0) {
            nextTabs.splice(fallbackCandidates[0].idx, 1);
          }
        }
      }

      const { title: routeTitle } = getRouteMetadata(path, (k, d) => t(k, d));
      const newTabId = generateTabId(path);
      const newTab: Tab = {
        id: newTabId,
        path,
        title: options?.title || routeTitle || 'Page',
        lastAccessed: Date.now(),
      };

      nextTabs.push(newTab);
      setTabs(nextTabs);

      if (!options?.background) {
        setActiveTabId(newTabId);
        navigate(path);
      }
    },
    [navigate, switchTab, t]
  );

  const closeTab = useCallback(
    (id: string) => {
      const existingTabs = tabsRef.current;
      const targetTab = existingTabs.find((t) => t.id === id);
      if (!targetTab) return;

      // Dirty confirmation
      if (targetTab.dirty) {
        const confirmClose = window.confirm(
          t('tabs.unsavedConfirm', 'Ada perubahan yang belum disimpan di tab ini. Tetap tutup?')
        );
        if (!confirmClose) return;
      }

      // If this is the last tab, reset to home
      if (existingTabs.length <= 1) {
        const homeMeta = getRouteMetadata('/home', (k, d) => t(k, d));
        const newHomeTab: Tab = {
          id: generateTabId('/home'),
          path: '/home',
          title: homeMeta.title,
          lastAccessed: Date.now(),
        };
        setTabs([newHomeTab]);
        setActiveTabId(newHomeTab.id);
        navigate('/home');
        return;
      }

      const targetIdx = existingTabs.findIndex((t) => t.id === id);
      const nextTabs = existingTabs.filter((t) => t.id !== id);
      setTabs(nextTabs);

      // If closing active tab, activate neighbor
      if (activeTabIdRef.current === id) {
        const nextActiveIdx = targetIdx > 0 ? targetIdx - 1 : 0;
        const nextActiveTab = nextTabs[nextActiveIdx] || nextTabs[0];
        setActiveTabId(nextActiveTab.id);
        navigate(nextActiveTab.path);
      }
    },
    [navigate, t]
  );

  const closeOtherTabs = useCallback(
    (id: string) => {
      const existingTabs = tabsRef.current;
      const keepTabs = existingTabs.filter((t) => t.id === id || t.pinned);
      setTabs(keepTabs);
      if (!keepTabs.some((t) => t.id === activeTabIdRef.current)) {
        setActiveTabId(id);
        const active = keepTabs.find((t) => t.id === id);
        if (active) navigate(active.path);
      }
    },
    [navigate]
  );

  const closeTabsToRight = useCallback(
    (id: string) => {
      const existingTabs = tabsRef.current;
      const targetIdx = existingTabs.findIndex((t) => t.id === id);
      if (targetIdx === -1) return;

      const keepTabs = existingTabs.filter((t, idx) => idx <= targetIdx || t.pinned);
      setTabs(keepTabs);
      if (!keepTabs.some((t) => t.id === activeTabIdRef.current)) {
        setActiveTabId(id);
        const active = keepTabs.find((t) => t.id === id);
        if (active) navigate(active.path);
      }
    },
    [navigate]
  );

  const reorderTabs = useCallback((startIndex: number, endIndex: number) => {
    setTabs((prev) => {
      const result = Array.from(prev);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      return result;
    });
  }, []);

  const setTabTitle = useCallback((idOrPath: string, title: string) => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id === idOrPath || t.path === idOrPath) {
          if (t.title === title) return t;
          return { ...t, title };
        }
        return t;
      })
    );
  }, []);

  const setTabDirty = useCallback((id: string, isDirty: boolean) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, dirty: isDirty } : t))
    );
  }, []);

  const togglePinTab = useCallback((id: string) => {
    setTabs((prev) => {
      const target = prev.find((t) => t.id === id);
      if (!target) return prev;
      const updated = prev.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t));
      // Sort pinned tabs to the front
      return [
        ...updated.filter((t) => t.pinned),
        ...updated.filter((t) => !t.pinned),
      ];
    });
  }, []);

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) || tabs[0],
    [tabs, activeTabId]
  );

  const value = useMemo(
    () => ({
      tabs,
      activeTabId,
      activeTab,
      openTab,
      closeTab,
      closeOtherTabs,
      closeTabsToRight,
      switchTab,
      reorderTabs,
      setTabTitle,
      setTabDirty,
      togglePinTab,
    }),
    [
      tabs,
      activeTabId,
      activeTab,
      openTab,
      closeTab,
      closeOtherTabs,
      closeTabsToRight,
      switchTab,
      reorderTabs,
      setTabTitle,
      setTabDirty,
      togglePinTab,
    ]
  );

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export function useTabs(): TabsContextType {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('useTabs must be used within a TabsProvider');
  }
  return context;
}

// Hook to check if the current component is in the currently active tab
// eslint-disable-next-line react-refresh/only-export-components
export function useIsActiveTab(): boolean {
  const context = useContext(TabContext);
  return context.isActive;
}

// Hook to get current tab ID
// eslint-disable-next-line react-refresh/only-export-components
export function useCurrentTabId(): string {
  const context = useContext(TabContext);
  return context.tabId;
}

// Hook for pages to easily set their tab title
// eslint-disable-next-line react-refresh/only-export-components
export function useTabTitle(title: string | undefined | null) {
  const { tabId } = useContext(TabContext);
  const { setTabTitle } = useTabs();

  useEffect(() => {
    if (tabId && title && title.trim().length > 0) {
      setTabTitle(tabId, title.trim());
    }
  }, [tabId, title, setTabTitle]);
}

// Helper to check if a tab is considered idle (>15m)
// eslint-disable-next-line react-refresh/only-export-components
export function isTabIdle(tab: Tab): boolean {
  if (tab.pinned) return false;
  return Date.now() - tab.lastAccessed > IDLE_THRESHOLD_MS;
}
