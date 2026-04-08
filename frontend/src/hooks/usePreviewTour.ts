import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EventData, Step } from 'react-joyride';
import { STATUS } from 'react-joyride';
import { useTranslation } from 'react-i18next';

const KEY_TOUR_A = 'preview-tour-a-seen';
const KEY_TOUR_B = 'preview-tour-b-seen';

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

function markSeen(tour: TourId) {
  safeSet(tour === 'a' ? KEY_TOUR_A : KEY_TOUR_B, '1');
}

function hasSeen(tour: TourId): boolean {
  return Boolean(safeGet(tour === 'a' ? KEY_TOUR_A : KEY_TOUR_B));
}

export interface UsePreviewTourResult {
  activeTour: TourId | null;
  steps: Step[];
  run: boolean;
  handleCallback: (data: EventData) => void;
  replayTourA: () => void;
  replayTourB: () => void;
}

export function usePreviewTour(projectPaid: boolean): UsePreviewTourResult {
  const { t } = useTranslation();
  const [activeTour, setActiveTour] = useState<TourId | null>(null);
  const [run, setRun] = useState(false);
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

  // Auto-run Tour A once on first visit.
  useEffect(() => {
    if (hasSeen('a')) return;
    setActiveTour('a');
    setRun(true);
  }, []);

  // Auto-run Tour B once when project becomes paid.
  useEffect(() => {
    const prev = prevPaidRef.current;
    prevPaidRef.current = projectPaid;
    if (prev === null) return;
    if (prev === false && projectPaid === true && !hasSeen('b')) {
      setActiveTour('b');
      setRun(true);
    }
  }, [projectPaid]);

  const handleCallback = useCallback((data: EventData) => {
    const status = data.status;
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      if (activeTour) markSeen(activeTour);
      setRun(false);
      setActiveTour(null);
    }
  }, [activeTour]);

  const replayTourA = useCallback(() => {
    setActiveTour('a');
    setRun(true);
  }, []);

  const replayTourB = useCallback(() => {
    setActiveTour('b');
    setRun(true);
  }, []);

  return { activeTour, steps, run, handleCallback, replayTourA, replayTourB };
}

