import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EventData, Step } from 'react-joyride';
import { ACTIONS, EVENTS, STATUS } from 'react-joyride';
import { useTranslation } from 'react-i18next';

const STORAGE_KEY = 'preview-tour-seen';
const STEP_KEY = 'preview-tour-step';

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* noop */ }
}
function safeRemove(key: string): void {
  try { localStorage.removeItem(key); } catch { /* noop */ }
}

export interface UsePreviewTourResult {
  steps: Step[];
  stepIndex: number;
  run: boolean;
  handleCallback: (data: EventData) => void;
  replay: () => void;
}

export function usePreviewTour(): UsePreviewTourResult {
  const { t } = useTranslation();
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const steps = useMemo<Step[]>(() => [
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
      placement: 'right',
    },
    {
      target: '[data-tour="action-data-panel"]',
      title: t('tour.dataPanelTitle'),
      content: t('tour.dataPanelContent'),
      disableBeacon: true,
      placement: 'right',
    },
    {
      target: '[data-tour="action-inquiries"]',
      title: t('tour.inquiriesTitle'),
      content: t('tour.inquiriesContent'),
      disableBeacon: true,
      placement: 'right',
    },
    {
      target: '[data-tour="action-edit"]',
      title: t('tour.editModeTitle'),
      content: t('tour.editModeContent'),
      disableBeacon: true,
      placement: 'right',
    },
    {
      target: '[data-tour="action-payments"]',
      title: t('tour.paymentsTitle'),
      content: t('tour.paymentsContent'),
      disableBeacon: true,
      placement: 'right',
    },
    {
      target: '[data-tour="action-download"]',
      title: t('tour.downloadTitle'),
      content: t('tour.downloadContent'),
      disableBeacon: true,
      placement: 'right',
    },
    {
      target: '[data-tour="action-files"]',
      title: t('tour.filesTitle'),
      content: t('tour.filesContent'),
      disableBeacon: true,
      placement: 'right',
    },
    {
      target: '[data-tour="action-refresh"]',
      title: t('tour.refreshTitle'),
      content: t('tour.refreshContent'),
      disableBeacon: true,
      placement: 'right',
    },
  ], [t]);

  useEffect(() => {
    if (safeGet(STORAGE_KEY)) return;
    const saved = parseInt(safeGet(STEP_KEY) ?? '0', 10);
    setStepIndex(isNaN(saved) ? 0 : saved);
    setRun(true);
  }, []);

  const handleCallback = useCallback((data: EventData) => {
    const { status, action, index, type } = data;

    if (type === EVENTS.STEP_AFTER) {
      const next = action === ACTIONS.PREV ? Math.max(0, index - 1) : index + 1;
      safeSet(STEP_KEY, String(next));
      setStepIndex(next);
    }

    if (type === EVENTS.TARGET_NOT_FOUND) {
      const next = index + 1;
      safeSet(STEP_KEY, String(next));
      setStepIndex(next);
    }

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      safeSet(STORAGE_KEY, '1');
      safeRemove(STEP_KEY);
      setRun(false);
      setStepIndex(0);
    }
  }, []);

  const replay = useCallback(() => {
    safeRemove(STORAGE_KEY);
    safeRemove(STEP_KEY);
    setStepIndex(0);
    setRun(true);
  }, []);

  return { steps, stepIndex, run, handleCallback, replay };
}
