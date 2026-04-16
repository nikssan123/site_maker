import { Router } from 'express';
import { z } from 'zod';
import {
  requestRegistration,
  verifyRegistration,
  resendVerification,
  requestPasswordReset,
  resetPassword,
  login,
  getMe,
  changePassword,
  requestPasswordChange,
  confirmPasswordChange,
  requestEmailChange,
  confirmEmailChange,
  deleteAccount,
} from '../services/authService';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

const credSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const verifySchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

const resendSchema = z.object({
  email: z.string().email(),
});

const forgotSchema = z.object({
  email: z.string().email(),
});

const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

router.post('/register', async (req, res, next) => {
  try {
    const { email, password } = credSchema.parse(req.body);
    const result = await requestRegistration(email, password);
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/verify-email', async (req, res, next) => {
  try {
    const { email, code } = verifySchema.parse(req.body);
    const result = await verifyRegistration(email, code);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/resend-verification', async (req, res, next) => {
  try {
    const { email } = resendSchema.parse(req.body);
    const result = await resendVerification(email);
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = forgotSchema.parse(req.body);
    const result = await requestPasswordReset(email);
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = resetSchema.parse(req.body);
    const result = await resetPassword(token, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = credSchema.parse(req.body);
    const result = await login(email, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const result = await getMe(req.user.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const result = await changePassword(req.user.userId, currentPassword, newPassword);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/request-password-change', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const result = await requestPasswordChange(req.user.userId, currentPassword, newPassword);
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
});

const confirmPasswordChangeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

router.post('/confirm-password-change', requireAuth, async (req, res, next) => {
  try {
    const { code } = confirmPasswordChangeSchema.parse(req.body);
    const result = await confirmPasswordChange(req.user.userId, code);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const requestEmailChangeSchema = z.object({
  newEmail: z.string().email(),
  password: z.string().min(1),
});

router.post('/request-email-change', requireAuth, async (req, res, next) => {
  try {
    const { newEmail, password } = requestEmailChangeSchema.parse(req.body);
    const result = await requestEmailChange(req.user.userId, newEmail, password);
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
});

const confirmEmailChangeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

router.post('/confirm-email-change', requireAuth, async (req, res, next) => {
  try {
    const { code } = confirmEmailChangeSchema.parse(req.body);
    const result = await confirmEmailChange(req.user.userId, code);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const deleteAccountSchema = z.object({
  password: z.string().min(1),
});

router.post('/delete-account', requireAuth, async (req, res, next) => {
  try {
    const { password } = deleteAccountSchema.parse(req.body);
    const result = await deleteAccount(req.user.userId, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
