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

export default router;
