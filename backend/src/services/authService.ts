import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';
import { EmailService } from './emailService';
import { buildVerificationEmail } from '../lib/verificationEmail';
import { buildPasswordResetEmail } from '../lib/passwordResetEmail';

const SALT_ROUNDS = 12;
const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 30 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;

function appBaseUrl(): string {
  const explicit = (process.env.APP_BASE_URL ?? '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const success = (process.env.STRIPE_SUCCESS_URL ?? '').trim();
  if (success) return success.replace(/\/billing.*$/, '').replace(/\/+$/, '');
  return 'http://localhost';
}

let emailSvc: EmailService | null = null;
function getEmailService(): EmailService {
  if (!emailSvc) emailSvc = new EmailService();
  return emailSvc;
}

function signToken(userId: string, email: string, isAdmin: boolean): string {
  return jwt.sign(
    { userId, email, isAdmin },
    process.env.JWT_SECRET!,
    { expiresIn: '24h' },
  );
}

function generateCode(): string {
  // 6-digit numeric code, zero-padded
  const n = crypto.randomInt(0, 1_000_000);
  return n.toString().padStart(6, '0');
}

async function sendVerificationCode(to: string, code: string): Promise<void> {
  const svc = getEmailService();
  const { subject, html } = buildVerificationEmail(code);
  await svc.sendEmail({ from: svc.platformFrom, to, subject, html });
}

async function sendPasswordResetLink(to: string, resetUrl: string): Promise<void> {
  const svc = getEmailService();
  const { subject, html } = buildPasswordResetEmail(resetUrl);
  await svc.sendEmail({ from: svc.platformFrom, to, subject, html });
}

function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function normalizeEmail(email: string): string {
  return String(email ?? '').trim().toLowerCase();
}

export async function requestRegistration(rawEmail: string, password: string) {
  const email = normalizeEmail(rawEmail);
  if (!email) throw new AppError(400, 'Email is required');

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError(409, 'Email already registered');

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, SALT_ROUNDS);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  await prisma.pendingRegistration.upsert({
    where: { email },
    create: { email, passwordHash, codeHash, expiresAt, attempts: 0 },
    update: { passwordHash, codeHash, expiresAt, attempts: 0 },
  });

  await sendVerificationCode(email, code);

  return { pending: true as const, email };
}

export async function verifyRegistration(rawEmail: string, rawCode: string) {
  const email = normalizeEmail(rawEmail);
  const code = String(rawCode ?? '').trim();
  if (!email || !code) throw new AppError(400, 'Email and code are required');

  const pending = await prisma.pendingRegistration.findUnique({ where: { email } });
  if (!pending) throw new AppError(400, 'No pending verification for this email');

  if (pending.expiresAt.getTime() < Date.now()) {
    await prisma.pendingRegistration.delete({ where: { email } }).catch(() => undefined);
    throw new AppError(400, 'Verification code expired');
  }

  if (pending.attempts >= MAX_CODE_ATTEMPTS) {
    await prisma.pendingRegistration.delete({ where: { email } }).catch(() => undefined);
    throw new AppError(429, 'Too many attempts. Please request a new code.');
  }

  const valid = await bcrypt.compare(code, pending.codeHash);
  if (!valid) {
    await prisma.pendingRegistration.update({
      where: { email },
      data: { attempts: { increment: 1 } },
    });
    throw new AppError(400, 'Invalid verification code');
  }

  // Race: ensure user still doesn't exist
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.pendingRegistration.delete({ where: { email } }).catch(() => undefined);
    throw new AppError(409, 'Email already registered');
  }

  const user = await prisma.user.create({
    data: { email, passwordHash: pending.passwordHash },
  });
  await prisma.pendingRegistration.delete({ where: { email } }).catch(() => undefined);

  return {
    token: signToken(user.id, user.email, false),
    user: { id: user.id, email: user.email, isAdmin: false, freeProjectUsed: false },
  };
}

export async function resendVerification(rawEmail: string) {
  const email = normalizeEmail(rawEmail);
  if (!email) throw new AppError(400, 'Email is required');

  const pending = await prisma.pendingRegistration.findUnique({ where: { email } });
  if (!pending) throw new AppError(400, 'No pending verification for this email');

  const sinceUpdate = Date.now() - pending.updatedAt.getTime();
  if (sinceUpdate < RESEND_COOLDOWN_MS) {
    const waitSec = Math.ceil((RESEND_COOLDOWN_MS - sinceUpdate) / 1000);
    throw new AppError(429, `Please wait ${waitSec}s before requesting another code`);
  }

  const code = generateCode();
  const codeHash = await bcrypt.hash(code, SALT_ROUNDS);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  await prisma.pendingRegistration.update({
    where: { email },
    data: { codeHash, expiresAt, attempts: 0 },
  });

  await sendVerificationCode(email, code);

  return { pending: true as const, email };
}

export async function requestPasswordReset(rawEmail: string) {
  const email = normalizeEmail(rawEmail);
  if (!email) throw new AppError(400, 'Email is required');

  const user = await prisma.user.findUnique({ where: { email } });
  // Always return success to avoid leaking which emails are registered.
  if (!user) return { ok: true as const };

  // Invalidate any outstanding unused tokens for this user.
  await prisma.passwordReset.updateMany({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });

  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);

  await prisma.passwordReset.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  const resetUrl = `${appBaseUrl()}/reset-password?token=${rawToken}`;
  await sendPasswordResetLink(email, resetUrl);

  return { ok: true as const };
}

export async function resetPassword(rawToken: string, newPassword: string) {
  const token = String(rawToken ?? '').trim();
  if (!token) throw new AppError(400, 'Token is required');
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const tokenHash = hashResetToken(token);
  const record = await prisma.passwordReset.findUnique({ where: { tokenHash } });
  if (!record) throw new AppError(400, 'Invalid or expired reset link');
  if (record.usedAt) throw new AppError(400, 'This reset link has already been used');
  if (record.expiresAt.getTime() < Date.now()) {
    throw new AppError(400, 'Reset link has expired');
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordReset.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Invalidate any other outstanding tokens for this user.
    prisma.passwordReset.updateMany({
      where: { userId: record.userId, usedAt: null, id: { not: record.id } },
      data: { usedAt: new Date() },
    }),
  ]);

  return { ok: true as const };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
  if (!user) throw new AppError(401, 'Invalid credentials');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError(401, 'Invalid credentials');

  return {
    token: signToken(user.id, user.email, user.isAdmin),
    user: { id: user.id, email: user.email, isAdmin: user.isAdmin },
  };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return {
    id: user.id,
    email: user.email,
    freeProjectUsed: user.freeProjectUsed,
    isAdmin: user.isAdmin,
  };
}
