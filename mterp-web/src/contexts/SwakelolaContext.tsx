import React, { createContext, useContext, useReducer, useCallback, ReactNode } from 'react';
import { RABItem, LocalPurchase } from '../types';
import {
  getProjectRAB,
  getProjectLocalPurchases,
  createLocalPurchase as apiCreateLocalPurchase,
  verifyLocalPurchase as apiVerifyLocalPurchase,
} from '../api/api';

interface RABSummary {
  totalBudget: number;
  totalRealized: number;
  totalCommitted: number;
  realizationPercent: number;
  itemCount: number;
}

interface PurchaseSummary {
  totalPurchases: number;
  totalVerified: number;
  totalPendingVerification: number;
}

interface SwakelolaState {
  projectId: string | null;
  rabItems: RABItem[];
  rabSummary: RABSummary | null;
  localPurchases: LocalPurchase[];
  purchaseSummary: PurchaseSummary | null;
  isLoading: boolean;
  error: string | null;
}

type SwakelolaAction =
  | { type: 'SET_PROJECT'; payload: string }
  | { type: 'FETCH_START' }
  | { type: 'SET_RAB_DATA'; payload: { items: RABItem[]; summary: RABSummary } }
  | { type: 'SET_PURCHASES_DATA'; payload: { purchases: LocalPurchase[]; summary: PurchaseSummary } }
  | { type: 'ADD_PURCHASE_SUCCESS'; payload: { purchase: LocalPurchase; rabItem?: { id: string; realizedQuantity: number; realizedAmount: number } } }
  | { type: 'UPDATE_PURCHASE_STATUS'; payload: { purchaseId: string; status: 'VERIFIED' | 'REJECTED'; rejectionReason?: string } }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'CLEAR_ERROR' };

const initialState: SwakelolaState = {
  projectId: null,
  rabItems: [],
  rabSummary: null,
  localPurchases: [],
  purchaseSummary: null,
  isLoading: false,
  error: null,
};

function swakelolaReducer(state: SwakelolaState, action: SwakelolaAction): SwakelolaState {
  switch (action.type) {
    case 'SET_PROJECT':
      return {
        ...state,
        projectId: action.payload,
        rabItems: [],
        rabSummary: null,
        localPurchases: [],
        purchaseSummary: null,
        error: null,
      };
    case 'FETCH_START':
      return { ...state, isLoading: true, error: null };
    case 'SET_RAB_DATA':
      return {
        ...state,
        isLoading: false,
        rabItems: action.payload.items,
        rabSummary: action.payload.summary,
      };
    case 'SET_PURCHASES_DATA':
      return {
        ...state,
        isLoading: false,
        localPurchases: action.payload.purchases,
        purchaseSummary: action.payload.summary,
      };
    case 'ADD_PURCHASE_SUCCESS': {
      const updatedPurchases = [action.payload.purchase, ...state.localPurchases];
      let updatedRabItems = state.rabItems;

      if (action.payload.rabItem) {
        const { id, realizedQuantity, realizedAmount } = action.payload.rabItem;
        updatedRabItems = state.rabItems.map((item) =>
          item._id === id
            ? {
                ...item,
                realizedQuantity,
                realizedAmount,
                remainingQuantity: Math.max(0, item.budgetedQuantity - realizedQuantity),
                remainingBudget: Math.max(0, item.totalBudget - realizedAmount),
              }
            : item
        );
      }

      const totalPurchases = (state.purchaseSummary?.totalPurchases || 0) + action.payload.purchase.totalPrice;
      const totalPending = (state.purchaseSummary?.totalPendingVerification || 0) + action.payload.purchase.totalPrice;

      return {
        ...state,
        isLoading: false,
        localPurchases: updatedPurchases,
        rabItems: updatedRabItems,
        purchaseSummary: state.purchaseSummary
          ? {
              ...state.purchaseSummary,
              totalPurchases,
              totalPendingVerification: totalPending,
            }
          : null,
      };
    }
    case 'UPDATE_PURCHASE_STATUS': {
      const updatedPurchases = state.localPurchases.map((p) =>
        p._id === action.payload.purchaseId
          ? { ...p, status: action.payload.status, rejectionReason: action.payload.rejectionReason }
          : p
      );
      return {
        ...state,
        isLoading: false,
        localPurchases: updatedPurchases,
      };
    }
    case 'SET_ERROR':
      return { ...state, isLoading: false, error: action.payload };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    default:
      return state;
  }
}

interface SwakelolaContextType extends SwakelolaState {
  setProjectId: (projectId: string) => void;
  refreshRAB: (projectId?: string) => Promise<void>;
  refreshPurchases: (projectId?: string, params?: { status?: string; rabItemId?: string }) => Promise<void>;
  recordPurchase: (formData: FormData) => Promise<LocalPurchase>;
  verifyPurchase: (purchaseId: string, status: 'VERIFIED' | 'REJECTED', reason?: string) => Promise<void>;
  getRABQuota: (rabItemId: string) => {
    item?: RABItem;
    remainingQty: number;
    remainingBudget: number;
    isOverBudget: boolean;
  };
  clearError: () => void;
}

const SwakelolaContext = createContext<SwakelolaContextType | undefined>(undefined);

export function SwakelolaProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(swakelolaReducer, initialState);

  const setProjectId = useCallback((projectId: string) => {
    dispatch({ type: 'SET_PROJECT', payload: projectId });
  }, []);

  const refreshRAB = useCallback(async (overrideProjectId?: string) => {
    const targetId = overrideProjectId || state.projectId;
    if (!targetId) return;

    dispatch({ type: 'FETCH_START' });
    try {
      const data = await getProjectRAB(targetId);
      dispatch({
        type: 'SET_RAB_DATA',
        payload: {
          items: data.rabItems || [],
          summary: data.summary,
        },
      });
    } catch (err: any) {
      const errorMsg = err.response?.data?.msg || err.message || 'Failed to fetch RAB data';
      dispatch({ type: 'SET_ERROR', payload: errorMsg });
    }
  }, [state.projectId]);

  const refreshPurchases = useCallback(
    async (overrideProjectId?: string, params?: { status?: string; rabItemId?: string }) => {
      const targetId = overrideProjectId || state.projectId;
      if (!targetId) return;

      dispatch({ type: 'FETCH_START' });
      try {
        const data = await getProjectLocalPurchases(targetId, params);
        dispatch({
          type: 'SET_PURCHASES_DATA',
          payload: {
            purchases: data.purchases || [],
            summary: data.summary,
          },
        });
      } catch (err: any) {
        const errorMsg = err.response?.data?.msg || err.message || 'Failed to fetch purchases';
        dispatch({ type: 'SET_ERROR', payload: errorMsg });
      }
    },
    [state.projectId]
  );

  const recordPurchase = useCallback(
    async (formData: FormData): Promise<LocalPurchase> => {
      const targetId = state.projectId;
      if (!targetId) throw new Error('No active project selected');

      dispatch({ type: 'FETCH_START' });
      try {
        const result = await apiCreateLocalPurchase(targetId, formData);
        dispatch({
          type: 'ADD_PURCHASE_SUCCESS',
          payload: {
            purchase: result.localPurchase,
            rabItem: result.rabItem,
          },
        });
        return result.localPurchase;
      } catch (err: any) {
        const errorMsg = err.response?.data?.msg || err.message || 'Failed to record purchase';
        dispatch({ type: 'SET_ERROR', payload: errorMsg });
        throw err;
      }
    },
    [state.projectId]
  );

  const verifyPurchase = useCallback(
    async (purchaseId: string, status: 'VERIFIED' | 'REJECTED', reason?: string) => {
      const targetId = state.projectId;
      if (!targetId) throw new Error('No active project selected');

      dispatch({ type: 'FETCH_START' });
      try {
        await apiVerifyLocalPurchase(targetId, purchaseId, { status, rejectionReason: reason });
        dispatch({
          type: 'UPDATE_PURCHASE_STATUS',
          payload: { purchaseId, status, rejectionReason: reason },
        });
      } catch (err: any) {
        const errorMsg = err.response?.data?.msg || err.message || 'Failed to update purchase verification';
        dispatch({ type: 'SET_ERROR', payload: errorMsg });
        throw err;
      }
    },
    [state.projectId]
  );

  const getRABQuota = useCallback(
    (rabItemId: string) => {
      const item = state.rabItems.find((r) => r._id === rabItemId);
      if (!item) {
        return { item: undefined, remainingQty: 0, remainingBudget: 0, isOverBudget: false };
      }
      const remainingQty = Math.max(0, (item.budgetedQuantity || 0) - (item.realizedQuantity || 0));
      const remainingBudget = Math.max(0, (item.totalBudget || 0) - (item.realizedAmount || 0));
      const isOverBudget = (item.realizedQuantity || 0) >= (item.budgetedQuantity || 0);

      return { item, remainingQty, remainingBudget, isOverBudget };
    },
    [state.rabItems]
  );

  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  return (
    <SwakelolaContext.Provider
      value={{
        ...state,
        setProjectId,
        refreshRAB,
        refreshPurchases,
        recordPurchase,
        verifyPurchase,
        getRABQuota,
        clearError,
      }}
    >
      {children}
    </SwakelolaContext.Provider>
  );
}

export function useSwakelola(): SwakelolaContextType {
  const context = useContext(SwakelolaContext);
  if (!context) {
    throw new Error('useSwakelola must be used within a SwakelolaProvider');
  }
  return context;
}
