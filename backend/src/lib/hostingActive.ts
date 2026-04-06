/** Bundled with €150 site purchase (generation pre-pay or project unlock). */
export const SITE_PURCHASE_FREE_HOSTING_DAYS = 30;
export const SITE_PURCHASE_BONUS_ITERATIONS = 10;

/**
 * Hosting is active if there is a Stripe subscription id on the project, or a non-expired free hosting window.
 */
export function isHostingActive(project: {
  hostingSubscriptionId: string | null;
  hostingFreeUntil: Date | null;
}): boolean {
  const now = new Date();
  if (project.hostingSubscriptionId) return true;
  if (project.hostingFreeUntil && project.hostingFreeUntil > now) return true;
  return false;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Extend free hosting by `days` from the later of now or current free-until (if still active). */
export function extendHostingFreeUntil(
  currentFreeUntil: Date | null,
  days: number,
): Date {
  const now = new Date();
  const base =
    currentFreeUntil && currentFreeUntil > now ? currentFreeUntil : now;
  return new Date(base.getTime() + days * MS_PER_DAY);
}
