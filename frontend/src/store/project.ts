import { create } from 'zustand';

export type GenerationStep = {
  step: number;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string;
};

export type FixAttempt = { attempt: number; error: string };

export interface PlanData {
  id: string;
  data: {
    appType: string;
    pages: string[];
    features: string[];
    style: string;
    tech: string;
    hasDatabase?: boolean;
    dataModels?: Array<{ name: string; fields: string[] }>;
  };
  locked: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ProjectState {
  sessionId: string | null;
  messages: ChatMessage[];
  plan: PlanData | null;
  projectId: string | null;
  runPort: number | null;
  projectPaid: boolean;
  /** Backend ALLOW_UNPAID_PROJECT_DOWNLOAD — download ZIP without Stripe (testing). */
  allowUnpaidDownload: boolean;
  projectHosted: boolean;
  iterationsTotal: number;
  paidIterationCredits: number;
  freeIterationLimit: number;
  isStreaming: boolean;
  streamBuffer: string;
  generationSteps: GenerationStep[];
  fixAttempts: FixAttempt[];
  /** Plain-language “Working on…” line from the server during generation */
  generationFriendlyMessage: string;
  phase: 'planning' | 'generating' | 'running' | 'error';

  setSessionId: (id: string) => void;
  addMessage: (msg: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setPlan: (plan: PlanData) => void;
  setProjectId: (id: string) => void;
  setRunPort: (port: number) => void;
  setProjectPaid: (paid: boolean) => void;
  setAllowUnpaidDownload: (v: boolean) => void;
  setProjectHosted: (hosted: boolean) => void;
  setIterationInfo: (total: number, paidCredits: number, freeLimit: number) => void;
  setPhase: (phase: ProjectState['phase']) => void;
  setIsStreaming: (v: boolean) => void;
  appendStreamToken: (token: string) => void;
  clearStreamBuffer: () => void;
  updateStep: (step: Partial<GenerationStep> & { step: number }) => void;
  addFixAttempt: (attempt: FixAttempt) => void;
  setGenerationFriendlyMessage: (message: string) => void;
  reset: () => void;
}

export const INITIAL_STEPS: GenerationStep[] = [
  { step: 1, label: 'Генериране на код', status: 'pending' },
  { step: 2, label: 'Запазване на проекта', status: 'pending' },
  { step: 3, label: 'Подготовка', status: 'pending' },
  { step: 4, label: 'Проверка', status: 'pending' },
  { step: 5, label: 'Стартиране на приложението', status: 'pending' },
];

export const useProjectStore = create<ProjectState>((set) => ({
  sessionId: null,
  messages: [],
  plan: null,
  projectId: null,
  runPort: null,
  projectPaid: false,
  allowUnpaidDownload: false,
  projectHosted: false,
  iterationsTotal: 0,
  paidIterationCredits: 0,
  freeIterationLimit: 2,
  isStreaming: false,
  streamBuffer: '',
  generationSteps: INITIAL_STEPS,
  fixAttempts: [],
  generationFriendlyMessage: '',
  phase: 'planning',

  setSessionId: (id) => set({ sessionId: id }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setMessages: (messages) => set({ messages }),
  setPlan: (plan) => set({ plan }),
  setProjectId: (id) => set({ projectId: id }),
  setRunPort: (port) => set({ runPort: port }),
  setProjectPaid: (paid) => set({ projectPaid: paid }),
  setAllowUnpaidDownload: (allowUnpaidDownload) => set({ allowUnpaidDownload }),
  setProjectHosted: (hosted) => set({ projectHosted: hosted }),
  setIterationInfo: (total, paidCredits, freeLimit) => set({ iterationsTotal: total, paidIterationCredits: paidCredits, freeIterationLimit: freeLimit }),
  setPhase: (phase) => set({ phase }),
  setIsStreaming: (v) => set({ isStreaming: v }),
  appendStreamToken: (token) =>
    set((s) => ({ streamBuffer: s.streamBuffer + token })),
  clearStreamBuffer: () => set({ streamBuffer: '' }),
  updateStep: (upd) =>
    set((s) => ({
      generationSteps: s.generationSteps.map((st) =>
        st.step === upd.step ? { ...st, ...upd } : st,
      ),
    })),
  addFixAttempt: (attempt) =>
    set((s) => ({ fixAttempts: [...s.fixAttempts, attempt] })),
  setGenerationFriendlyMessage: (message) => set({ generationFriendlyMessage: message }),
  reset: () =>
    set({
      sessionId: null,
      messages: [],
      plan: null,
      projectId: null,
      runPort: null,
      projectPaid: false,
      allowUnpaidDownload: false,
      projectHosted: false,
      iterationsTotal: 0,
      paidIterationCredits: 0,
      freeIterationLimit: 2,
      isStreaming: false,
      streamBuffer: '',
      generationSteps: INITIAL_STEPS,
      fixAttempts: [],
      generationFriendlyMessage: '',
      phase: 'planning',
    }),
}));
