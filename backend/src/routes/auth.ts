import { Router } from 'express';
import { z } from 'zod';
import { register, login, getMe } from '../services/authService';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

const credSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

router.post('/register', async (req, res, next) => {
  try {
    const { email, password } = credSchema.parse(req.body);
    const result = await register(email, password);
    res.status(201).json(result);
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
