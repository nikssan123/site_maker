import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';
import type { TokenUsage } from './aiClient';

/**
 * USD-per-1M-token pricing used for internal margin tracking + the 24h $ circuit breaker.
 * Users never see these numbers — they see a percent meter only. Update when provider pricing changes.
 */
const MODEL_PRICES_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  // Anthropic (as of 2026 Q1)
  'claude-opus-4-6':       { input: 15, output: 75 },
  'claude-opus-4-7':       { input: 15, output: 75 },
  'claude-sonnet-4-6':     { input: 3,  output: 15 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  // OpenAI
  'gpt-4o':  { input: 2.5, output: 10 },
  'gpt-4.1': { input: 2,   output: 8 },
};

const DEFAULT_PRICE = { input: 15, output: 75 }; // assume premium if unknown — protects margin

const PERIOD_FALLBACK_DAYS = 30;
const MONTHLY_TOKEN_LIMIT = parseInt(process.env.MONTHLY_TOKEN_LIMIT ?? '400000', 10);
const DAILY_USER_COST_CAP_CENTS = parseInt(process.env.DAILY_USER_COST_CAP_CENTS ?? '500', 10);

export interface LogTokensInput {
  userId: string;
  projectId?: string | null;
  provider: 'anthropic' | 'openai';
  model: string;
  /**
   * Pipeline stage tag. Convention: `iterate.<stage>`. Only iterate.* calls count toward the user
   * quota; other endpoints are recorded for analytics but not billed against the user.
   */
  endpoint: string;
  usage: TokenUsage;
  /**
   * True when this call came from one of the user's free-tier iterations (the first
   * FREE_ITERATION_LIMIT per project). Free usage is recorded for analytics but excluded
   * from the subscription % meter and the daily $ circuit breaker.
   */
  isFree?: boolean;
}

function costMicrosFor(model: string, usage: TokenUsage): number {
  const price = MODEL_PRICES_USD_PER_MTOK[model] ?? DEFAULT_PRICE;
  // 1 token costs price.input / 1_000_000 USD. Multiply by 10_000 for cost in 0.01¢ units (micros).
  return Math.round(
    (usage.inputTokens * price.input + usage.outputTokens * price.output) * 10000 / 1_000_000,
  );
}

export async function logTokens(input: LogTokensInput): Promise<void> {
  const costMicros = costMicrosFor(input.model, input.usage);
  try {
    await prisma.tokenUsageLog.create({
      data: {
        userId: input.userId,
        projectId: input.projectId ?? null,
        provider: input.provider,
        model: input.model,
        endpoint: input.endpoint,
        inputTokens: input.usage.inputTokens,
        outputTokens: input.usage.outputTokens,
        costMicros,
        isFree: input.isFree === true,
      },
    });
  } catch (err) {
    // Never break the iteration pipeline because of accounting. Log and move on.
    console.error('[tokenAccounting] failed to log tokens:', err);
  }
}

/**
 * Returns the user's current billing period window: either their subscription's period, or a
 * rolling 30-day window if they don't have an active sub (covers one-off TokenGrant consumers).
 */
async function getPeriodWindow(userId: string): Promise<{ start: Date; end: Date }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      iterationSubStatus: true,
      iterationSubCurrentPeriodStart: true,
      iterationSubCurrentPeriodEnd: true,
    },
  });
  if (
    user?.iterationSubStatus === 'active' &&
    user.iterationSubCurrentPeriodStart &&
    user.iterationSubCurrentPeriodEnd
  ) {
    return { start: user.iterationSubCurrentPeriodStart, end: user.iterationSubCurrentPeriodEnd };
  }
  const now = new Date();
  const start = new Date(now.getTime() - PERIOD_FALLBACK_DAYS * 24 * 60 * 60 * 1000);
  return { start, end: now };
}

export async function getUserPeriodUsage(userId: string): Promise<number> {
  const { start, end } = await getPeriodWindow(userId);
  const agg = await prisma.tokenUsageLog.aggregate({
    where: {
      userId,
      endpoint: { startsWith: 'iterate.' },
      isFree: false,
      createdAt: { gte: start, lte: end },
    },
    _sum: { inputTokens: true, outputTokens: true },
  });
  return (agg._sum.inputTokens ?? 0) + (agg._sum.outputTokens ?? 0);
}

export async function getUserGrantTokens(userId: string): Promise<number> {
  const now = new Date();
  const grants = await prisma.tokenGrant.findMany({
    where: {
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { tokens: true },
  });
  return grants.reduce((sum, g) => sum + g.tokens, 0);
}

export interface AllowanceSummary {
  hasActiveSub: boolean;
  subscriptionTokens: number;
  grantTokens: number;
  tokensUsed: number;
  tokensAllowance: number;
  /** 0..100 for the user-facing percent meter. */
  pct: number;
  periodStart: Date;
  periodEnd: Date;
}

export async function getAllowanceSummary(userId: string): Promise<AllowanceSummary> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      iterationSubStatus: true,
      iterationSubCurrentPeriodStart: true,
      iterationSubCurrentPeriodEnd: true,
    },
  });

  const hasActiveSub = user?.iterationSubStatus === 'active';
  const subscriptionTokens = hasActiveSub ? MONTHLY_TOKEN_LIMIT : 0;
  const [grantTokens, tokensUsed] = await Promise.all([
    getUserGrantTokens(userId),
    getUserPeriodUsage(userId),
  ]);
  const tokensAllowance = subscriptionTokens + grantTokens;
  const pct = tokensAllowance === 0
    ? (tokensUsed > 0 ? 100 : 0)
    : Math.min(100, Math.round((tokensUsed / tokensAllowance) * 100));

  const { start: periodStart, end: periodEnd } = await getPeriodWindow(userId);

  return {
    hasActiveSub,
    subscriptionTokens,
    grantTokens,
    tokensUsed,
    tokensAllowance,
    pct,
    periodStart,
    periodEnd,
  };
}

/**
 * Throws AppError(402, code='token_limit_reached') when the user has consumed their allowance.
 * Caller should short-circuit with the "2 free per project" check before invoking this.
 * Also enforces a 24h dollar circuit breaker to protect margin against adversarial output-heavy prompts.
 */
export async function assertCanIterate(userId: string): Promise<void> {
  // 24h $ circuit breaker — independent of subscription state. Free-tier iterations are
  // tracked elsewhere (FREE_ITERATION_LIMIT per project) and don't count here.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const dayAgg = await prisma.tokenUsageLog.aggregate({
    where: {
      userId,
      endpoint: { startsWith: 'iterate.' },
      isFree: false,
      createdAt: { gte: since },
    },
    _sum: { costMicros: true },
  });
  const dayMicros = dayAgg._sum.costMicros ?? 0;
  // 1 cent = 100 micros (costMicros is 0.01¢ precision).
  const dayCents = Math.floor(dayMicros / 100);
  if (dayCents >= DAILY_USER_COST_CAP_CENTS) {
    console.warn(
      `[tokenAccounting] user=${userId} hit daily $ cap: ${dayCents}¢ >= ${DAILY_USER_COST_CAP_CENTS}¢`,
    );
    throw new AppError(429, 'Daily usage limit reached. Please try again tomorrow.', 'daily_cap_reached');
  }

  const { hasActiveSub, tokensAllowance, tokensUsed } = await getAllowanceSummary(userId);
  if (tokensAllowance === 0) {
    throw new AppError(
      402,
      hasActiveSub
        ? 'Improvement plan quota exhausted.'
        : 'Subscribe to the improvement plan to continue.',
      'token_limit_reached',
    );
  }
  if (tokensUsed >= tokensAllowance) {
    throw new AppError(
      402,
      'Improvement plan quota exhausted for this period.',
      'token_limit_reached',
    );
  }
}

export async function grantTokens(params: {
  userId: string;
  tokens: number;
  reason: 'migration' | 'admin_grant' | 'topup_purchase';
  grantedBy?: string;
  stripeSessionId?: string;
  note?: string;
  expiresAt?: Date | null;
}): Promise<{ id: string }> {
  if (!Number.isFinite(params.tokens) || params.tokens <= 0) {
    throw new AppError(400, 'tokens must be a positive integer');
  }
  const grant = await prisma.tokenGrant.create({
    data: {
      userId: params.userId,
      tokens: Math.floor(params.tokens),
      reason: params.reason,
      grantedBy: params.grantedBy ?? null,
      stripeSessionId: params.stripeSessionId ?? null,
      note: params.note ?? null,
      expiresAt: params.expiresAt ?? null,
    },
    select: { id: true },
  });
  return grant;
}
