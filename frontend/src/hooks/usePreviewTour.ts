import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EventData, Step } from 'react-joyride';
import { ACTIONS, EVENTS, STATUS } from 'react-joyride';
import { useTranslation } from 'react-i18next';

const KEY_TOUR_A = 'preview-tour-a-seen';
const KEY_TOUR_B = 'preview-tour-b-seen';
const KEY_TOUR_A_STEP = 'preview-tour-a-step';
const KEY_TOUR_B_STEP = 'preview-tour-b-step';

type TourId = 'a' | 'b';

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore (privacy mode, etc.)
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function markSeen(tour: TourId) {
  safeSet(tour === 'a' ? KEY_TOUR_A : KEY_TOUR_B, '1');
  // Clean up step progress once finished
  safeRemove(tour === 'a' ? KEY_TOUR_A_STEP : KEY_TOUR_B_STEP);
}

function hasSeen(tour: TourId): boolean {
  return Boolean(safeGet(tour === 'a' ? KEY_TOUR_A : KEY_TOUR_B));
}

function getSavedStep(tour: TourId): number {
  const raw = safeGet(tour === 'a' ? KEY_TOUR_A_STEP : KEY_TOUR_B_STEP);
  if (raw) {
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n >= 0) return n;
  }
  return 0;
}

function saveStep(tour: TourId, index: number) {
  safeSet(tour === 'a' ? KEY_TOUR_A_STEP : KEY_TOUR_B_STEP, String(index));
}

export interface UsePreviewTourResult {
  activeTour: TourId | null;
  steps: Step[];
  stepIndex: number;
  run: boolean;
  handleCallback: (data: EventData) => void;
  replayTourA: () => void;
  replayTourB: () => void;
}

export function usePreviewTour(projectPaid: boolean): UsePreviewTourResult {
  const { t } = useTranslation();
  const [activeTour, setActiveTour] = useState<TourId | null>(null);
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const prevPaidRef = useRef<boolean | null>(null);

  const stepsA = useMemo<Step[]>(() => {
    return [
      {
        target: '[data-tour="preview-frame"]',
        title: t('tour.previewFrameTitle'),
        content: t('tour.previewFrameContent'),
        disableBeacon: true,
        placement: 'center',
      },
      {
        target: '[data-tour="action-improvements"]',
        title: t('tour.improvementsTitle'),
        content: t('tour.improvementsContent'),
        disableBeacon: true,
      },
      {
        target: '[data-tour="drawer-improvements"]',
        title: t('tour.improvementsDrawerTitle'),
        content: t('tour.improvementsDrawerContent'),
        disableBeacon: true,
        placement: 'left',
      },
      {
        target: '[data-tour="action-data-panel"]',
        title: t('tour.dataPanelTitle'),
        content: t('tour.dataPanelContent'),
        disableBeacon: true,
      },
      {
        target: '[data-tour="action-inquiries"]',
        title: t('tour.inquiriesTitle'),
        content: t('tour.inquiriesContent'),
        disableBeacon: true,
      },
      {
        target: '[data-tour="action-analytics"]',
        title: t('tour.analyticsTitle'),
        content: t('tour.analyticsContent'),
        disableBeacon: true,
      },
      {
        target: '[data-tour="action-payments"]',
        title: t('tour.paymentsTitle'),
        content: t('tour.paymentsContent'),
        disableBeacon: true,
      },
      {
        target: '[data-tour="action-edit"]',
        title: t('tour.editModeTitle'),
        content: t('tour.editModeContent'),
        disableBeacon: true,
      },
      {
        target: '[data-tour="action-logo"]',
        title: t('tour.logoTitle'),
        content: t('tour.logoContent'),
        disableBeacon: true,
      },
      {
        target: '[data-tour="action-hero"]',
        title: t('tour.heroTitle'),
        content: t('tour.heroContent'),
        disableBeacon: true,
      },
      {
        target: '[data-tour="action-refresh"]',
        title: t('tour.refreshTitle'),
        content: t('tour.refreshContent'),
        disableBeacon: true,
      },
    ];
  }, [t]);

  const stepsB = useMemo<Step[]>(() => {
    return [
      {
        target: '[data-tour="action-download"]',
        title: t('tour.downloadTitle'),
        content: t('tour.downloadContent'),
        disableBeacon: true,
      },
      {
        target: '[data-tour="action-hosting"]',
        title: t('tour.hostingTitle'),
        content: t('tour.hostingContent'),
        disableBeacon: true,
      },
      {
        target: '[data-tour="action-files"]',
        title: t('tour.filesTitle'),
        content: t('tour.filesContent'),
        disableBeacon: true,
      },
      {
        target: '[data-tour="action-email"]',
        title: t('tour.emailTitle'),
        content: t('tour.emailContent'),
        disableBeacon: true,
      },
    ];
  }, [t]);

  const steps = activeTour === 'b' ? stepsB : activeTour === 'a' ? stepsA : [];

  // Auto-run Tour A once on first visit (resume from saved step).
  useEffect(() => {
    if (hasSeen('a')) return;
    const saved = getSavedStep('a');
    setActiveTour('a');
    setStepIndex(saved);
    setRun(true);
  }, []);

  // Auto-run Tour B once when project becomes paid (resume from saved step).
  useEffect(() => {
    const prev = prevPaidRef.current;
    prevPaidRef.current = projectPaid;
    if (prev === null) return;
    if (prev === false && projectPaid === true && !hasSeen('b')) {
      const saved = getSavedStep('b');
      setActiveTour('b');
      setStepIndex(saved);
      setRun(true);
    }
  }, [projectPaid]);

  const handleCallback = useCallback((data: EventData) => {
    const { status, action, index, type } = data;

    // Persist step progress on each forward/backward navigation
    if (type === EVENTS.STEP_AFTER && activeTour) {
      const nextIndex = action === ACTIONS.PREV ? Math.max(0, index - 1) : index + 1;
      saveStep(activeTour, nextIndex);
      setStepIndex(nextIndex);
    }

    // Skip missing targets (conditional sidebar buttons) — jump forward
    if (type === EVENTS.TARGET_NOT_FOUND && activeTour) {
      const nextIndex = index + 1;
      saveStep(activeTour, nextIndex);
      setStepIndex(nextIndex);
    }

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      if (activeTour) markSeen(activeTour);
      setRun(false);
      setActiveTour(null);
      setStepIndex(0);
    }
  }, [activeTour]);

  const replayTourA = useCallback(() => {
    safeRemove(KEY_TOUR_A_STEP);
    setActiveTour('a');
    setStepIndex(0);
    setRun(true);
  }, []);

  const replayTourB = useCallback(() => {
    safeRemove(KEY_TOUR_B_STEP);
    setActiveTour('b');
    setStepIndex(0);
    setRun(true);
  }, []);

  return { activeTour, steps, stepIndex, run, handleCallback, replayTourA, replayTourB };
}
