import { z } from 'zod';
import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';
import { getIterateAssistClient, ChatMessage } from './aiClient';
import { logTokens } from './tokenAccountingService';
import { scopeIteration } from './iterateScopeService';

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
  /** 1–3 bullets: Bulgarian, user-visible outcomes only (no file paths, no English). */
  planBulletsBg: z.array(z.string().min(1)).optional(),
  spec: z.string().optional(),
  targetFiles: z.array(z.string().min(1)).optional(),
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

function buildFileTree(paths: string[], maxLines = 600): string {
  // Compact indented tree for inclusion in the prompt — gives the model navigation
  // sense without the cost of opening file bodies.
  const root: Record<string, unknown> = {};
  const skip = (p: string) => p.includes('node_modules') || p.startsWith('dist/') || /\.lock$/i.test(p);
  for (const p of paths) {
    if (skip(p)) continue;
    const parts = p.split('/').filter(Boolean);
    let cur: Record<string, unknown> = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isLeaf = i === parts.length - 1;
      const existing = cur[part];
      if (isLeaf) {
        cur[part] = null;
      } else {
        if (!existing || typeof existing !== 'object') cur[part] = {};
        cur = cur[part] as Record<string, unknown>;
      }
    }
  }
  const lines: string[] = [];
  const walk = (node: Record<string, unknown>, prefix: string) => {
    const keys = Object.keys(node).sort();
    for (const k of keys) {
      if (lines.length >= maxLines) return;
      const child = node[k];
      lines.push(`${prefix}${k}${child === null ? '' : '/'}`);
      if (child && typeof child === 'object') walk(child as Record<string, unknown>, `${prefix}  `);
      if (lines.length >= maxLines) return;
    }
  };
  walk(root, '');
  return lines.join('\n');
}

function lastUserContent(conversation: ChatMessage[]): string {
  return [...conversation].reverse().find((m) => m.role === 'user')?.content?.trim() ?? '';
}

function isActionableImprovementRequest(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length < 6) return false;

  return /\b(добави|направи|сложи|смени|махни|премахни|покажи|скрий|обнови|редактирай|коригирай|поправи|премести|увеличи|намали|add|create|make|change|remove|update|edit|fix|move|show|hide)\b/i.test(t)
    || /(секция|страница|бутон|навигац|меню|форма|карта|хедър|футър|заглав|текст|изображ|банер|about|about us|contact|hero|section|page|button|menu|navigation|form|header|footer)/i.test(t);
}

function buildContextualClarifyQuestion(userMessage: string): string {
  const t = userMessage.trim().toLowerCase();

  if (/(за нас|about)/i.test(t) && /(секция|страница|add|добави|new|нова)/i.test(t)) {
    return 'Искаш ли „За нас“ да е отделна страница в менюто или секция в началната страница, и какво основно съдържание да включва?';
  }
  if (/(контакт|contact)/i.test(t) && /(секция|страница|форма|add|добави|new|нова)/i.test(t)) {
    return 'Искаш ли контактната част да е отделна страница или секция, и трябва ли да има форма, телефон и адрес?';
  }
  if (/(меню|навигац|navigation|header)/i.test(t)) {
    return 'Какво точно искаш да се промени в навигацията и къде трябва да води новият елемент?';
  }
  if (/(цвят|цвет|color|бутон|button|текст|заглав)/i.test(t)) {
    return 'Кой елемент искаш да се промени и как трябва да изглежда след промяната?';
  }

  return 'Може ли с едно изречение да уточниш какво точно трябва да се промени и как трябва да изглежда крайният резултат?';
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

function normalizePlanBulletsBg(raw: string[] | undefined, fallback?: string): string[] {
  const fromModel = (raw ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !isBoilerplateBullet(s));
  if (fromModel.length >= 1) return fromModel.slice(0, 3);
  const alt = (fallback ?? '').trim();
  if (alt) return [alt];
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

  const projectId = session.project.id;
  const planData = session.plan.data as Record<string, unknown>;
  const projectFiles = Object.keys((session.project.files as Record<string, string>) ?? {});
  const conversationContext = conversation
    .slice(-6)
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');
  const alreadyAskedAQuestion = conversation.some(
    (m) => m.role === 'assistant' && /[?？]\s*$/.test(m.content.trim()),
  );

  const fileTree = buildFileTree(projectFiles, 500);
  const lastUser = lastUserContent(conversation);

  // Single LLM call: model returns either a clarifying question or a complete ready payload
  // (bullets + spec + targetFiles). No explore loop, no separate draftSpec call, no separate
  // scope call — picking target files is done inline by the same model from the file tree.
  const mandatoryNoMoreQuestions = alreadyAskedAQuestion
    ? `\nВАЖНО: Вече има поне един въпрос от асистента в този разговор. ВРЪЩАЙ САМО ready: true. Никакви въпроси.`
    : '';

  const system = `Ти си старши full-stack инженер. Потребителят иска „подобрение“ на вече генерирано приложение.

ПРОЕКТ (вътрешен контекст):
- App plan: ${JSON.stringify(planData)}
- Файлово дърво (избери targetFiles от тези пътища):
${fileTree}

- Последен разговор:
${conversationContext || '(няма)'}

ЦЕЛ: винаги връщай готова промяна. Само при крайна неяснота — ОДИН кратък продуктов въпрос.

Правила за вземане на решение:
- По подразбиране ready: true; прави разумни допускания от контекста.
- НЕ предлагай отделен план за одобрение, не моли за потвърждение.
- При типични UI заявки (промяна на цвят, добавяне на секция/бутон/страница, текстова промяна) — веднага ready: true.
- Ако вече е зададен въпрос в историята — забранено да задаваш още един.
- Не задавай общо „къде точно" — избери най-логичното място според структурата.

Правила за planBulletsBg (само при ready: true):
- 1–3 кратки реда на български: какво вижда крайният потребител след промяната.
- Всеки ред = конкретен видим резултат („Бутонът „Купи" в хедъра става зелен").
- Без общи фрази („ще приложим заявката", „минимални промени"), без файлове, без английски.
- Ако промяната е малка, един бул е напълно достатъчен. НЕ дъвчи 3 пъти едно и също.

Правила за targetFiles:
- Избери САМО от пътищата във файловото дърво.
- 1–6 файла; колкото по-малко, толкова по-добре.
- Без node_modules, dist, lockfiles.
- За UI промени — компонента/страницата, която се променя.
- За промени на текстове в многоезични апове — включи и locale/i18n файловете, ако ги има в дървото.

Правила за spec (английски, технически):
- 3–6 конкретни bullets за инженера, който ще пише кода.
- Всеки bullet = точно действие (кой файл, кой компонент/prop, какво се променя).
- Базирай се на видимото име от файловото дърво — не измисляй компоненти, които не съществуват.
- Минимален обхват; никакви широкомащабни рефактори.
- Ако е нужен нов файл (под src/components, src/pages, src/hooks, src/lib, src/features, src/styles, src/locales, src/i18n, src/data), опиши точния нов път и че трябва да се „create".

Правила за въпрос (само ако ready: false и още няма asistant въпрос):
- Кратък продуктов въпрос на български. Без файлове, без жаргон.${mandatoryNoMoreQuestions}

Изход: САМО валиден JSON, без markdown.
1) Не е готово: { "ready": false, "question": "<кратък български въпрос>" }
2) Готово: { "ready": true, "planBulletsBg": ["<бул>", ...], "spec": "<технически bullets на английски>", "targetFiles": ["<път>", ...] }
`;

  const ai = getIterateAssistClient();
  const mainResult = await ai.completeWithUsage(conversation, system, { maxTokens: 1200 });
  await logTokens({
    userId,
    projectId,
    provider: mainResult.provider,
    model: mainResult.model,
    endpoint: 'iterate.clarify',
    usage: mainResult.usage,
  });
  const parsed = safeParseJson(mainResult.text);
  const data = parsed ? RESULT_SCHEMA.safeParse(parsed) : null;

  // The model auto-proceeds on "actionable" requests (clear verbs, UI nouns) even if it
  // hesitated to set ready: true. Combined with alreadyAskedAQuestion, this keeps the
  // pipeline moving without a stuck back-and-forth.
  const shouldAutoProceed = alreadyAskedAQuestion || isActionableImprovementRequest(lastUser);

  // Helper: when the model didn't return targetFiles, fall back to the scope service.
  // This is the only place a second LLM call may happen, and only on the unhappy path.
  async function readyFromModel(
    bullets: string[],
    spec: string,
    targets: string[] | undefined,
  ): Promise<IterateClarifyResult> {
    const allowed = new Set(projectFiles);
    let finalTargets = (targets ?? []).filter((p) => allowed.has(p)).slice(0, 8);
    let nonGoals: string[] = [];
    let scopeSummaryBg = '';
    if (finalTargets.length === 0) {
      try {
        const scoped = await scopeIteration({
          plan: planData,
          filePaths: projectFiles,
          refinedSpec: spec || bullets.join(' '),
          maxFiles: 6,
          userId,
          projectId,
        });
        finalTargets = scoped.targetFiles;
        nonGoals = scoped.nonGoalsBg;
        scopeSummaryBg = scoped.summaryBg;
      } catch {
        finalTargets = projectFiles
          .filter((p) => /src\/(App|main)\.(tsx?|jsx?)$|src\/pages\/|src\/components\//.test(p))
          .slice(0, 4);
      }
    }
    const safeBullets = bullets.length > 0
      ? bullets
      : (scopeSummaryBg ? [scopeSummaryBg] : ['Ще приложа описаната от теб промяна.']);
    return {
      kind: 'ready',
      summary: safeBullets[0] ?? '',
      planBulletsBg: safeBullets,
      spec: spec || `Apply the change requested by the user using best judgement.\n${bullets.join('\n')}`,
      targetFiles: finalTargets,
      nonGoals,
    };
  }

  // Failed JSON parse: fall back gracefully.
  if (!data?.success) {
    if (shouldAutoProceed) {
      return readyFromModel([], '', undefined);
    }
    return { kind: 'question', message: buildContextualClarifyQuestion(lastUser) };
  }

  const v = data.data;

  // Model returned a question.
  if (!v.ready) {
    if (shouldAutoProceed) {
      const bullets = normalizePlanBulletsBg(v.planBulletsBg);
      return readyFromModel(bullets, (v.spec ?? '').trim(), v.targetFiles);
    }
    const q = (v.question ?? '').trim();
    return { kind: 'question', message: q || buildContextualClarifyQuestion(lastUser) };
  }

  // Model is ready. Make sure we have the minimum payload.
  const bullets = normalizePlanBulletsBg(v.planBulletsBg);
  const spec = (v.spec ?? '').trim();
  if (!spec && !shouldAutoProceed) {
    return { kind: 'question', message: buildContextualClarifyQuestion(lastUser) };
  }
  return readyFromModel(bullets, spec, v.targetFiles);
}
