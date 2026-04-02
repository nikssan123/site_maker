import { EventEmitter } from 'events';
import { prisma } from '../index';

// One shared emitter for the process.
// Raised to support many concurrent SSE subscribers across sessions.
const emitter = new EventEmitter();
emitter.setMaxListeners(200);

/**
 * Persist the event to Postgres then broadcast it in-process.
 * Always awaited by callers — the event is durable before the pipeline advances.
 */
export async function publishEvent(sessionId: string, payload: object): Promise<void> {
  await prisma.generationEvent.create({ data: { sessionId, payload } });
  emitter.emit(`session:${sessionId}`, payload);
}

/**
 * Subscribe to live events for a session.
 * Returns an unsubscribe function — call it when the SSE connection closes.
 */
export function subscribeToSession(
  sessionId: string,
  handler: (payload: object) => void,
): () => void {
  const key = `session:${sessionId}`;
  emitter.on(key, handler);
  return () => emitter.off(key, handler);
}

/**
 * Delete all stored events for a session.
 * Called at the start of each new generation/iteration to prevent stale replay.
 */
export async function clearSessionEvents(sessionId: string): Promise<void> {
  await prisma.generationEvent.deleteMany({ where: { sessionId } });
}
