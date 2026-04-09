import { Router } from 'express';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth } from '../middleware/requireAuth';
import { chat, chatStream } from '../services/plannerService';
import { prisma } from '../index';

const router = Router();

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { message, sessionId } = z
      .object({ message: z.string().min(1), sessionId: z.string().optional() })
      .parse(req.body);

    let sid = sessionId;
    if (!sid) {
      const session = await prisma.session.create({ data: { userId: req.user.userId } });
      sid = session.id;
    }

    const result = await chat(sid, req.user.userId, message);
    res.json({ sessionId: sid, ...result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/chat/stream — SSE endpoint that streams assistant tokens one-by-one,
 * then sends a final "done" event with the complete message and plan.
 */
router.post('/stream', requireAuth, async (req, res) => {
  const { message, sessionId } = z
    .object({ message: z.string().min(1), sessionId: z.string().optional() })
    .parse(req.body);

  let sid = sessionId;
  if (!sid) {
    const session = await prisma.session.create({ data: { userId: req.user.userId } });
    sid = session.id;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  // Send sessionId immediately so the frontend can store it
  res.write(`data: ${JSON.stringify({ type: 'session', sessionId: sid })}\n\n`);

  try {
    const result = await chatStream(sid, req.user.userId, message, (token) => {
      res.write(`data: ${JSON.stringify({ type: 'token', token })}\n\n`);
    });

    res.write(`data: ${JSON.stringify({ type: 'done', message: result.message, plan: result.plan })}\n\n`);
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message ?? 'Chat failed' })}\n\n`);
  }

  res.end();
});

// POST /api/chat/extract-colors — analyze an uploaded image and return a color theme
router.post('/extract-colors', requireAuth, async (req, res, next) => {
  try {
    const { imageDataUrl } = z.object({ imageDataUrl: z.string().min(1) }).parse(req.body);

    const match = imageDataUrl.match(/^data:([a-zA-Z0-9+/.-]+);base64,(.+)$/s);
    if (!match) return res.status(400).json({ error: 'Невалиден формат на изображението' });
    const [, rawMime, base64Data] = match;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
    type AllowedType = typeof allowedTypes[number];
    const mediaType: AllowedType = allowedTypes.includes(rawMime as AllowedType)
      ? (rawMime as AllowedType)
      : 'image/jpeg';

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Data },
            },
            {
              type: 'text',
              text:
                'Извлечи 2-те най-забележими цвята на марка или акцент от изображението за уеб интерфейс. ' +
                'Върни САМО валиден JSON обект — без markdown, без обяснение:\n' +
                '{"name":"<кратко описателно име>","primary":"<hex>","secondary":"<hex>","background":"<много тъмен hex, производен от основния нюанс>"}\n' +
                'Primary = най-забележим цвят. Secondary = допълващ акцент. Background = много тъмен неутрален с нюанс.',
            },
          ],
        },
      ],
    });

    const block = response.content[0];
    const text = block.type === 'text' ? block.text.trim() : '';

    // Strip any accidental markdown fences
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const colorData = JSON.parse(cleaned);

    // Validate shape
    const schema = z.object({
      name: z.string(),
      primary: z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
      secondary: z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
      background: z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
    });
    return res.json(schema.parse(colorData));
  } catch (err) {
    return next(err);
  }
});

export default router;
