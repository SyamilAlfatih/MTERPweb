import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface BreadcrumbContextType {
  dynamicLabels: Record<string, string>;
  setDynamicLabel: (key: string, label: string) => void;
  clearDynamicLabel: (key: string) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextType>({
  dynamicLabels: {},
  setDynamicLabel: () => {},
  clearDynamicLabel: () => {},
});

export const BreadcrumbProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dynamicLabels, setDynamicLabels] = useState<Record<string, string>>({});

  const setDynamicLabel = useCallback((key: string, label: string) => {
    setDynamicLabels((prev) => {
      if (prev[key] === label) return prev;
      return { ...prev, [key]: label };
    });
  }, []);

  const clearDynamicLabel = useCallback((key: string) => {
    setDynamicLabels((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  return (
    <BreadcrumbContext.Provider value={{ dynamicLabels, setDynamicLabel, clearDynamicLabel }}>
      {children}
    </BreadcrumbContext.Provider>
  );
};

export const useBreadcrumbContext = () => useContext(BreadcrumbContext);

/**
 * Hook to set a dynamic breadcrumb label for a key (e.g. 'project') within a component lifecycle.
 */
export function useSetBreadcrumb(key: string, label: string | undefined | null) {
  const { setDynamicLabel, clearDynamicLabel } = useBreadcrumbContext();

  useEffect(() => {
    if (label && label.trim().length > 0) {
      setDynamicLabel(key, label.trim());
    }
    return () => {
      clearDynamicLabel(key);
    };
  }, [key, label, setDynamicLabel, clearDynamicLabel]);
}
