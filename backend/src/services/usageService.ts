import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';

type UsageType = 'generation' | 'message' | 'iteration';

const TIER_LIMITS: Record<string, Record<UsageType, number>> = {
  free: { generation: 3, message: 50, iteration: 0 },
  pro: { generation: 50, message: Infinity, iteration: Infinity },
  max: { generation: Infinity, message: Infinity, iteration: Infinity },
};

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export async function checkLimit(
  userId: string,
  tier: string,
  type: UsageType,
): Promise<void> {
  const limit = TIER_LIMITS[tier]?.[type] ?? 0;
  if (limit === Infinity) return;
  if (limit === 0) {
    throw new AppError(402, 'Upgrade required', 'upgrade_required');
  }

  const month = currentMonth();
  const count = await prisma.usageLog.count({
    where: { userId, type, month },
  });

  if (count >= limit) {
    throw new AppError(402, `${type} limit reached`, 'upgrade_required');
  }
}

export async function recordUsage(
  userId: string,
  type: UsageType,
): Promise<void> {
  await prisma.usageLog.create({
    data: { userId, type, month: currentMonth() },
  });
}
