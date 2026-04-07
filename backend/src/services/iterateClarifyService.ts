import { z } from 'zod';
import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';
import { getChatClient, ChatMessage } from './aiClient';
import { scopeIteration } from './iterateScopeService';
import { exploreIterationFiles } from './iterateExploreService';

export type IterateClarifyResult =
  | { kind: 'question'; message: string }
  | { kind: 'ready'; summary: string; spec: string; targetFiles: string[]; nonGoals: string[]; explorerContextNotes?: string };

const RESULT_SCHEMA = z.object({
  ready: z.boolean(),
  question: z.string().optional(),
  summary: z.string().optional(),
  spec: z.string().optional(),
});

function safeParseJson(raw: string): unknown | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export async function clarifyIteration(
  sessionId: string,
  userId: string,
  conversation: ChatMessage[],
): Promise<IterateClarifyResult> {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, userId },
    include: { project: true, plan: true },
  });
  if (!session?.project) throw new AppError(400, 'Проектът не е намерен');
  if (!session.plan) throw new AppError(400, 'Няма план за този проект');

  const planData = session.plan.data as Record<string, unknown>;
  const projectFiles = Object.keys((session.project.files as Record<string, string>) ?? {});

  const system = `
Ти си старши full‑stack инженер и продуктов човек. Потребителят иска да направи "подобрение" на вече генерираното приложение.

ВЪТРЕШЕН КОНТЕКСТ (само за теб — не го споменавай пред потребителя):
- План: ${JSON.stringify(planData)}
- Файлове в проекта: ${projectFiles.join(', ')}

Цел: изясни изискванията на продуктово ниво, после генерирай техническа спецификация за инженер.

Правила за въпросите (question):
- Питай само за ПРОДУКТОВО поведение: "Какво да се случи след клик?", "Само за влезли потребители ли?", "Какъв текст?"
- НИКОГА не споменавай файлове, компоненти или технически термини пред потребителя.
- Задавай само 1 кратък въпрос наведнъж.
- Ако заявката е достатъчно ясна (напр. "смени цвета на бутона в хедъра"), отговори веднага с ready: true.

Правила за спецификацията (spec):
- Пиши на английски, за Claude Sonnet, който ще изпълни задачата.
- Включи точни имена на файлове от списъка по-горе.
- 4-8 конкретни bullets — какво точно да се промени.

ВЪРНИ САМО JSON (без markdown):
1) Ако НЕ е готово: { "ready": false, "question": "<въпрос на български, без технически детайли>" }
2) Ако Е готово:    { "ready": true, "summary": "<1-2 изречения на български за потребителя>", "spec": "<технически bullets на английски с имена на файлове>" }
`;

  const ai = getChatClient();
  const raw = await ai.complete(conversation, system, { maxTokens: 400 });
  const parsed = safeParseJson(raw);
  const data = parsed ? RESULT_SCHEMA.safeParse(parsed) : null;

  if (!data?.success) {
    // Fallback: ask a safe generic question.
    return { kind: 'question', message: 'Къде точно в приложението да е промяната (коя страница/екран) и какво трябва да се случва?' };
  }

  const v = data.data;
  if (!v.ready) {
    const q = (v.question ?? '').trim();
    return { kind: 'question', message: q || 'Можеш ли да уточниш какво точно трябва да се промени и къде?' };
  }

  const summary = (v.summary ?? '').trim();
  const spec = (v.spec ?? '').trim();
  if (!spec) {
    return { kind: 'question', message: 'Ок — можеш ли да уточниш още малко (какво точно поведение/правила), за да го направя точно?' };
  }

  const scoped = await scopeIteration({
    plan: planData,
    filePaths: projectFiles,
    refinedSpec: spec,
    maxFiles: 8,
  });

  // Optional extra exploration step (Cursor-like): open a few files and refine the target list.
  // This does NOT change what we show the user (still a file list), it only improves context for Claude later.
  let explorerTargetFiles: string[] | null = null;
  let explorerContextNotes: string | null = null;
  try {
    const explored = await exploreIterationFiles({
      plan: planData,
      refinedSpec: spec,
      filePaths: projectFiles,
      fileContents: (session.project.files as Record<string, string>) ?? {},
      maxOpens: 6,
      maxTurns: 4,
    });
    explorerTargetFiles = explored.targetFiles;
    explorerContextNotes = explored.contextNotes;
  } catch {
    /* ignore exploration failures */
  }

  return {
    kind: 'ready',
    summary: summary || scoped.summaryBg || 'Ок — имам яснота какво да направя.',
    spec,
    targetFiles: explorerTargetFiles && explorerTargetFiles.length > 0 ? explorerTargetFiles : scoped.targetFiles,
    nonGoals: scoped.nonGoalsBg,
    ...(explorerContextNotes ? { explorerContextNotes } : {}),
  };
}

