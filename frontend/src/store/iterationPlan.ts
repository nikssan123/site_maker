import { create } from 'zustand';
import { api } from '../lib/api';

export type IterationPlanStatus = 'active' | 'past_due' | 'canceled' | 'none' | string;

export interface IterationGrant {
  id: string;
  reason: 'migration' | 'admin_grant' | 'topup_purchase' | string;
  note: string | null;
  createdAt: string;
  expiresAt: string | null;
}

interface IterationPlanState {
  loaded: boolean;
  loading: boolean;
  error: string | null;
  status: IterationPlanStatus;
  cancelAtPeriodEnd: boolean;
  hasActiveSub: boolean;
  /** User-facing percent meter (0..100). Raw token counts are never kept here. */
  pct: number;
  periodStart: string | null;
  periodEnd: string | null;
  grants: IterationGrant[];
  refresh: () => Promise<void>;
  reset: () => void;
}

const EMPTY = {
  loaded: false,
  loading: false,
  error: null as string | null,
  status: 'none' as IterationPlanStatus,
  cancelAtPeriodEnd: false,
  hasActiveSub: false,
  pct: 0,
  periodStart: null as string | null,
  periodEnd: null as string | null,
  grants: [] as IterationGrant[],
};

export const useIterationPlanStore = create<IterationPlanState>((set) => ({
  ...EMPTY,
  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api.iterationPlanStatus();
      set({
        loaded: true,
        loading: false,
        error: null,
        status: data.status,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd,
        hasActiveSub: data.hasActiveSub,
        pct: data.pct,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        grants: data.grants,
      });
    } catch (err) {
      set({
        loaded: true,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load plan',
      });
    }
  },
  reset: () => set({ ...EMPTY }),
}));
