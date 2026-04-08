import { z } from 'zod';
import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';
import { getChatClient, getIterateAssistClient, ChatMessage } from './aiClient';
import { scopeIteration } from './iterateScopeService';
import { exploreIterationFiles } from './iterateExploreService';

export type IterateClarifyResult =
  | { kind: 'question'; message: string }
  | {
      kind: 'ready';
      summary: string;
      /** Short Bulgarian lines for the user plan card (what changes, in plain language). */
      planBulletsBg: string[];
      spec: string;
      targetFiles: string[];
      nonGoals: string[];
      explorerContextNotes?: string;
    };

const RESULT_SCHEMA = z.object({
  ready: z.boolean(),
  question: z.string().optional(),
  summary: z.string().optional(),
  /** 3–6 bullets: Bulgarian, user-visible outcomes only (no file paths, no English). */
  planBulletsBg: z.array(z.string().min(1)).optional(),
  spec: z.string().optional(),
  targetFiles: z.array(z.string().min(1)).optional(),
});

const CLARIFY_MAX_FILES = 10;
const CLARIFY_MAX_PER_FILE = 8000;
const CLARIFY_MAX_TOTAL = 48000;

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

function pickPathsForClarifyContext(paths: string[], maxFiles: number): string[] {
  const ordered: string[] = [];
  const used = new Set<string>();
  const pushMatch = (pred: (p: string) => boolean) => {
    for (const p of paths) {
      if (ordered.length >= maxFiles) return;
      if (!used.has(p) && pred(p)) {
        used.add(p);
        ordered.push(p);
      }
    }
  };

  const skip = (p: string) =>
    p.includes('node_modules') || p.startsWith('dist/') || /\.lock$/i.test(p);

  const usable = paths.filter((p) => !skip(p));
  pushMatch((p) => p === 'server.js' || p.endsWith('/server.js'));
  pushMatch((p) => /(^|\/)src\/App\.(tsx|jsx)$/.test(p));
  pushMatch((p) => /(^|\/)src\/main\.(tsx|jsx)$/.test(p));
  pushMatch((p) => /(^|\/)src\/(index|router)\.(tsx|jsx|ts|js)$/.test(p));
  pushMatch((p) => /(^|\/)src\/theme/.test(p));
  pushMatch((p) => /(^|\/)src\/pages\//.test(p));
  pushMatch((p) => /(^|\/)src\/components\//.test(p));
  for (const p of usable) {
    if (ordered.length >= maxFiles) break;
    if (!used.has(p)) {
      used.add(p);
      ordered.push(p);
    }
  }
  return ordered.slice(0, maxFiles);
}

function buildClarifyFileContext(fileContents: Record<string, string>, paths: string[]): string {
  const picked = pickPathsForClarifyContext(paths, CLARIFY_MAX_FILES);
  let budget = CLARIFY_MAX_TOTAL;
  const parts: string[] = [];
  for (const p of picked) {
    const raw = fileContents[p];
    if (typeof raw !== 'string') continue;
    const clipped =
      raw.length > CLARIFY_MAX_PER_FILE
        ? `${raw.slice(0, CLARIFY_MAX_PER_FILE)}\n\n/* ... truncated ... */\n`
        : raw;
    const block = `=== ${p} ===\n${clipped}`;
    if (block.length > budget) {
      if (budget < 400) break;
      parts.push(`${block.slice(0, budget - 120)}\n\n/* ... truncated ... */\n`);
      break;
    }
    parts.push(block);
    budget -= block.length + 2;
  }
  return parts.join('\n\n');
}

function lastUserContent(conversation: ChatMessage[]): string {
  return [...conversation].reverse().find((m) => m.role === 'user')?.content?.trim() ?? '';
}

function isBoilerplateBullet(s: string): boolean {
  const x = s.toLowerCase();
  return (
    x.includes('implement the requested') ||
    x.includes('keep existing styles') ||
    x.includes('prefer minimal edits') ||
    x.includes('ensure build passes') ||
    x.includes('update only the necessary') ||
    x.includes('ui remains consistent') ||
    x.includes('assumptions:') ||
    x.includes('use best judgement') ||
    x.includes('do not ask more questions') ||
    x.includes('запазваме стила') ||
    x.includes('минимални промени') ||
    x.includes('без да чупим останалата функционалност')
  );
}

/** Fallback when the model omits planBulletsBg: split summary into readable lines. */
function friendlyPlanBulletsFromSummary(text: string): string[] {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const bySentence = t
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
  if (bySentence.length >= 2) return bySentence.slice(0, 8);
  const byComma = t
    .split(/[,;]\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
  if (byComma.length >= 2) return byComma.slice(0, 8);
  return [t];
}

function normalizePlanBulletsBg(raw: string[] | undefined, summary: string, summaryAlt?: string): string[] {
  const fromModel = (raw ?? []).map((s) => s.trim()).filter(Boolean).filter((s) => !isBoilerplateBullet(s));
  if (fromModel.length >= 1) return fromModel.slice(0, 8);
  const fromSummary = friendlyPlanBulletsFromSummary(summary);
  if (fromSummary.length >= 1) return fromSummary;
  const alt = (summaryAlt ?? '').trim();
  if (alt) return friendlyPlanBulletsFromSummary(alt);
  return [];
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
  const fileRecord = (session.project.files as Record<string, string>) ?? {};
  const alreadyAskedAQuestion = conversation.some(
    (m) => m.role === 'assistant' && /[?？]\s*$/.test(m.content.trim()),
  );

  // Draft an English intent spec for exploration (no questions, no file paths).
  const draftFromUser = lastUserContent(conversation);
  let draftSpecEn = draftFromUser || 'Apply the requested change using best judgement.';
  try {
    const chatAi = getChatClient();
    const draftSystem = `You convert a user's change request into technical intent.\n\nRules:\n- English only.\n- 3–8 concise bullet points.\n- Do NOT ask questions.\n- Do NOT include file paths.\n`;
    const draftUser = `User request (may be Bulgarian):\n${draftFromUser || '(empty)'}\n\nApp plan JSON:\n${JSON.stringify(planData)}`;
    const drafted = await chatAi.complete([{ role: 'user', content: draftUser }], draftSystem, { maxTokens: 250 });
    const cleaned = drafted.trim();
    if (cleaned.length >= 20) draftSpecEn = cleaned;
  } catch {
    /* ignore */
  }

  // Cursor-style exploration BEFORE deciding to ask a question.
  let explored:
    | {
        targetFiles: string[];
        contextNotes: string;
        openedPaths: string[];
        openedBodies: string;
      }
    | null = null;
  try {
    explored = await exploreIterationFiles({
      plan: planData,
      refinedSpec: draftSpecEn,
      filePaths: projectFiles,
      fileContents: fileRecord,
      maxOpens: 6,
      maxTurns: 4,
    });
  } catch {
    explored = null;
  }

  const suggestedTargets = explored?.targetFiles?.length ? explored.targetFiles : null;
  const fileContext = buildClarifyFileContext(fileRecord, suggestedTargets ?? projectFiles);
  const explorationNotes = explored?.contextNotes?.trim() || '';
  const exploredBodies = explored?.openedBodies?.trim() || '';

  const mandatoryNoMoreQuestions =
    alreadyAskedAQuestion
      ? `
ЗАДЪЛЖИТЕЛНО за този ход:
- В този разговор вече е зададен поне един въпрос от асистента към потребителя.
- Върни САМО валиден JSON с "ready": true, "summary", "planBulletsBg" и "spec".
- Забранено е "ready": false или поле "question".
- Направи разумни допускания; включи пълна техническа spec на английски с точни пътища към файлове от проекта.
`
      : '';

  const system = `
Ти си старши full‑stack инженер и продуктов човек. Потребителят иска да направи "подобрение" на вече генерираното приложение.

ВЪТРЕШЕН КОНТЕКСТ (не го цитирай дословно в полетата summary/question за потребителя):
- План (JSON): ${JSON.stringify(planData)}
- Налични пътища (за spec): ${projectFiles.join(', ')}

СЪДЪРЖАНИЕ НА ИЗБРАНИ ФАЙЛОВЕ (за разбиране на кода; в summary/question НЕ споменавай пътища, имена на файлове, .tsx/.jsx, "src/"):
${fileContext || '(няма налично съдържание)'}

CURSOR-STYLE EXPLORATION (internal notes; do not mention file paths to the user in summary/question):
${explorationNotes || '(none)'}

OPENED FILE SNIPPETS (internal; for understanding only):
${exploredBodies || '(none)'}

Цел: почти винаги директно готова spec; само при крайна неяснота — един кратък продуктов въпрос (и само ако още няма съобщение от асистента в този thread).

Правила за потребителския текст (summary и question):
- Пиши на български, без технически жаргон, без имена на файлове и без пътища.

Правила за planBulletsBg (само при ready: true):
- Масив от 3–6 кратки реда на български: какво точно ще се промени за крайния потребител на сайта/приложението.
- Всеки ред = конкретно видимо действие или резултат (напр. „Бутонът „Купи“ в хедъра става зелен и по-широк“).
- Забранени са общи фрази от типа „ще приложим заявката“, „минимални промени“, „запазваме стила“ — вместо това опиши РЕЗУЛТАТА.
- Без английски, без пътища, без имена на файлове, без код.

Правила за въпроси:
- Ако вече е зададен поне един въпрос в историята на разговора, НЕ задавай въпрос — винаги ready: true (виж ЗАДЪЛЖИТЕЛНО по-долу ако е приложимо).
- Иначе: най-много един въпрос за целия чат; питай само за продуктово поведение.
- При ясни заявки ("смени цвета на бутона", "добави поле") — веднага ready: true с разумни допускания.

Правила за spec (английски, за кодовия модел):
- 4–8 конкретни bullets; включи точни пътища от проекта където е нужно.
- Минимален обхват; без големи рефакторинги.

ВЪРНИ САМО JSON (без markdown):
1) Ако НЕ е готово и още няма assistant съобщение в този thread: { "ready": false, "question": "<български, без технически детайли>" }
2) Ако е готово: { "ready": true, "summary": "<1–2 изречения на български>", "planBulletsBg": ["<конкретна промяна>", "..."], "spec": "<технически bullets на английски>" }
${mandatoryNoMoreQuestions}
`;

  const ai = getIterateAssistClient();
  const raw = await ai.complete(conversation, system, { maxTokens: alreadyAskedAQuestion ? 1800 : 1500 });
  const parsed = safeParseJson(raw);
  const data = parsed ? RESULT_SCHEMA.safeParse(parsed) : null;

  async function readyFromScopeFallback(
    summary: string,
    refinedSpec: string,
    specPrefix: string,
    userMessageBg?: string,
  ): Promise<IterateClarifyResult> {
    const scoped = await scopeIteration({
      plan: planData,
      filePaths: projectFiles,
      refinedSpec,
      maxFiles: 8,
    });
    const spec =
      `${specPrefix}\nTarget files (edit only as needed):\n${scoped.targetFiles.map((f) => `- ${f}`).join('\n')}`;
    const alt = [scoped.summaryBg, userMessageBg].filter(Boolean).join(' ').trim();
    let planBulletsBg = normalizePlanBulletsBg(undefined, summary, alt || undefined);
    if (planBulletsBg.length === 0) {
      planBulletsBg = [summary || scoped.summaryBg || 'Ще приложа описаната от теб промяна в приложението.'];
    }
    return {
      kind: 'ready',
      summary,
      planBulletsBg,
      spec,
      targetFiles: scoped.targetFiles,
      nonGoals: scoped.nonGoalsBg,
    };
  }

  if (!data?.success) {
    if (alreadyAskedAQuestion) {
      const lastUser = lastUserContent(conversation);
      return readyFromScopeFallback(
        'Ок — ще го направя по най-разумния начин на база описанието ти.',
        lastUser || 'Apply the requested change using best judgement.',
        `Assumptions: Use best judgement; do not ask more questions.\n` +
          `- Implement the requested change described by the user.\n` +
          `- Keep existing styles and flows unless explicitly requested.\n` +
          `- Prefer minimal edits; update only the necessary files.\n` +
          `- Ensure build passes and UI remains consistent.\n`,
        lastUser || undefined,
      );
    }
    return {
      kind: 'question',
      message: 'Къде точно в приложението да е промяната (коя страница/екран) и какво трябва да се случва?',
    };
  }

  const v = data.data;
  if (!v.ready) {
    if (!alreadyAskedAQuestion) {
      const q = (v.question ?? '').trim();
      return {
        kind: 'question',
        message: q || 'Можеш ли да уточниш какво точно трябва да се промени и къде?',
      };
    }

    const forceSystem = `${system}\n\nIMPORTANT: You MUST return ready:true with summary, planBulletsBg (3–6 concrete Bulgarian bullets for the end user), and spec. No questions.`;
    try {
      const forcedRaw = await ai.complete(conversation, forceSystem, { maxTokens: 2000 });
      const forcedParsed = safeParseJson(forcedRaw);
      const forcedData = forcedParsed ? RESULT_SCHEMA.safeParse(forcedParsed) : null;
      if (forcedData?.success && forcedData.data.ready && (forcedData.data.spec ?? '').trim()) {
        const summary = (forcedData.data.summary ?? '').trim();
        const spec = (forcedData.data.spec ?? '').trim();
        const scoped = await scopeIteration({
          plan: planData,
          filePaths: projectFiles,
          refinedSpec: spec,
          maxFiles: 8,
        });
        const sum = summary || scoped.summaryBg || 'Ок — имам яснота какво да направя.';
        let planBulletsBg = normalizePlanBulletsBg(forcedData.data.planBulletsBg, sum, scoped.summaryBg);
        if (planBulletsBg.length === 0) planBulletsBg = [sum];
        return {
          kind: 'ready',
          summary: sum,
          planBulletsBg,
          spec,
          targetFiles: scoped.targetFiles,
          nonGoals: scoped.nonGoalsBg,
        };
      }
    } catch {
      /* ignore */
    }

    const lastUser = lastUserContent(conversation);
    return readyFromScopeFallback(
      'Ок — продължавам с промяната по най-доброто тълкуване на заявката.',
      lastUser || 'Apply the requested change using best judgement.',
      `Assumptions: User did not provide more details; proceed with best judgement.\n` +
        `- Implement the requested change.\n` +
        `- Keep scope minimal; avoid broad refactors.\n` +
        `- Preserve existing UX and styling unless asked.\n` +
        `- Ensure build passes.\n`,
      lastUser || undefined,
    );
  }

  const summary = (v.summary ?? '').trim();
  const spec = (v.spec ?? '').trim();
  if (!spec) {
    if (alreadyAskedAQuestion) {
      const lastUser = lastUserContent(conversation);
      return readyFromScopeFallback(
        summary || 'Ок — имам яснота какво да направя.',
        lastUser || 'Apply the requested change using best judgement.',
        `Assumptions: Proceed from user message; minimal change.\n` +
          `- Implement what the user asked.\n` +
          `- Keep scope small.\n`,
        lastUser || undefined,
      );
    }
    return {
      kind: 'question',
      message: 'Ок — можеш ли да уточниш още малко (какво точно поведение/правила), за да го направя точно?',
    };
  }

  const scoped = await scopeIteration({
    plan: planData,
    filePaths: projectFiles,
    refinedSpec: spec,
    maxFiles: 8,
  });

  let explorerTargetFiles: string[] | null = null;
  let explorerContextNotes: string | null = null;
  try {
    const explored = await exploreIterationFiles({
      plan: planData,
      refinedSpec: spec,
      filePaths: projectFiles,
      fileContents: fileRecord,
      maxOpens: 6,
      maxTurns: 4,
    });
    explorerTargetFiles = explored.targetFiles;
    explorerContextNotes = explored.contextNotes;
  } catch {
    /* ignore exploration failures */
  }

  const sum = summary || scoped.summaryBg || 'Ок — имам яснота какво да направя.';
  let planBulletsBg = normalizePlanBulletsBg(v.planBulletsBg, sum, scoped.summaryBg);
  if (planBulletsBg.length === 0) planBulletsBg = [sum];

  return {
    kind: 'ready',
    summary: sum,
    planBulletsBg,
    spec,
    targetFiles: (() => {
      const allowed = new Set(projectFiles);
      const modelSuggested = (v.targetFiles ?? []).filter((p) => allowed.has(p)).slice(0, 8);
      if (modelSuggested.length > 0) return modelSuggested;
      if (suggestedTargets && suggestedTargets.length > 0) return suggestedTargets;
      if (explorerTargetFiles && explorerTargetFiles.length > 0) return explorerTargetFiles;
      return scoped.targetFiles;
    })(),
    nonGoals: scoped.nonGoalsBg,
    ...(explorerContextNotes ? { explorerContextNotes } : {}),
  };
}
