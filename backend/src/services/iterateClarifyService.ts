import { z } from 'zod';
import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';
import { getIterateAssistClient, ChatMessage } from './aiClient';
import { logTokens } from './tokenAccountingService';
import { scopeIteration } from './iterateScopeService';
import { buildFileTree } from '../lib/fileTree';

const EXECUTION_BRIEF_SCHEMA = z.object({
  userRequest: z.string().min(1),
  approvedPlan: z.array(z.string().min(1)).min(1),
  constraints: z.array(z.string()).default([]),
  expectedOutcome: z.string().min(1),
  avoidChanging: z.array(z.string()).default([]),
});

export type ExecutionBrief = z.infer<typeof EXECUTION_BRIEF_SCHEMA>;

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
      executionBrief: ExecutionBrief;
      explorerContextNotes?: string;
    };

const RESULT_SCHEMA = z.object({
  ready: z.boolean(),
  question: z.string().optional(),
  /** 1–3 bullets: Bulgarian, user-visible outcomes only (no file paths, no English). */
  planBulletsBg: z.array(z.string().min(1)).optional(),
  spec: z.string().optional(),
  targetFiles: z.array(z.string().min(1)).optional(),
  executionBrief: EXECUTION_BRIEF_SCHEMA.partial({
    userRequest: true,
    approvedPlan: true,
    expectedOutcome: true,
  }).optional(),
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

function lastUserContent(conversation: ChatMessage[]): string {
  return [...conversation].reverse().find((m) => m.role === 'user')?.content?.trim() ?? '';
}

const URL_RE = /https?:\/\/\S+/i;
const EMAIL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;
const PHONE_RE = /(\+?\d[\d\s\-()]{6,})/;
const SOCIAL_BRAND_RE = /(instagram|facebook|twitter|youtube|tiktok|linkedin|инстаграм|фейсбук|туитър|ютюб|тикток|линкедин)/i;
const OUTCOME_RE = /\b(ще\s+(виждат|вижда|се\s+вижда|има|се\s+появи|показва|изглежда|води)|трябва\s+да\s+(има|се\s+вижда|показва|води|изглежда)|should\s+(show|have|display|link)|must\s+(show|have|display))\b/i;

function isActionableImprovementRequest(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length < 6) return false;

  if (URL_RE.test(text) || EMAIL_RE.test(text) || PHONE_RE.test(text)) return true;
  if (SOCIAL_BRAND_RE.test(text)) return true;
  if (OUTCOME_RE.test(t)) return true;

  return /\b(добави|направи|сложи|постави|задай|свали|качи|публикувай|линкни|смени|махни|премахни|покажи|скрий|обнови|редактирай|коригирай|поправи|премести|увеличи|намали|add|create|make|change|remove|update|edit|fix|move|show|hide|set|put|link|wire|connect|paste)\b/i.test(t)
    || /(секция|страница|бутон|навигац|меню|форма|карта|хедър|футър|заглав|текст|изображ|банер|връзк|линк|икон|социален|социалн|логотип|лого|телефон|номер|адрес|описание|about|about us|contact|hero|section|page|button|menu|navigation|form|header|footer|link|icon|logo|email|phone|address)/i.test(t);
}

function buildContextualClarifyQuestion(userMessage: string): string {
  const t = userMessage.trim().toLowerCase();

  // If the message already carries concrete data (URL, email, phone, brand) the
  // caller should auto-proceed instead of asking. Empty string is the sentinel.
  if (URL_RE.test(userMessage) || EMAIL_RE.test(userMessage) || PHONE_RE.test(userMessage)) return '';
  if (SOCIAL_BRAND_RE.test(userMessage)) return '';

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
- Ако потребителят е дал URL, имейл, телефон, адрес или конкретна стойност — винаги ready: true.
- Ако потребителят е описал желания резултат с изречение от типа „ще се вижда X" / „трябва да има Y" — винаги ready: true. Не е нужен императивен глагол.
- Ако споменава конкретна социална мрежа (Instagram, Facebook и т.н.) с място (хедър/футър/контакти) — винаги ready: true. Без въпроси за уточнение.
- НЕ задавай уточняващ въпрос, ако в съобщението вече има конкретна цел и достатъчно данни. Питай само ако наистина не може да се направи разумно допускане.

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

Правила за executionBrief (на английски, за изпълнителния агент):
- userRequest: дословно последното искане на потребителя (на оригиналния език).
- approvedPlan: 2–6 кратки императивни bullets — какво трябва да се направи. Без файлове, без жаргон, конкретни действия.
- constraints: 0–4 ограничения (напр. "preserve existing styles", "do not change routing").
- expectedOutcome: едно изречение какво трябва да се вижда след промяната.
- avoidChanging: 0–4 файла или области, които НЕ трябва да се пипат.

Правила за въпрос (само ако ready: false и още няма asistant въпрос):
- Кратък продуктов въпрос на български. Без файлове, без жаргон.${mandatoryNoMoreQuestions}

Изход: САМО валиден JSON, без markdown.
1) Не е готово: { "ready": false, "question": "<кратък български въпрос>" }
2) Готово: { "ready": true, "planBulletsBg": ["<бул>", ...], "spec": "<технически bullets на английски>", "targetFiles": ["<път>", ...], "executionBrief": { "userRequest": "...", "approvedPlan": ["..."], "constraints": ["..."], "expectedOutcome": "...", "avoidChanging": ["..."] } }
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
    rawBrief: Partial<ExecutionBrief> | undefined,
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

    const fallbackPlan = bullets.length > 0
      ? bullets
      : (spec ? spec.split(/\n+/).map((s) => s.replace(/^[-*]\s*/, '').trim()).filter(Boolean) : [lastUser]);
    const executionBrief: ExecutionBrief = {
      userRequest: rawBrief?.userRequest?.trim() || lastUser,
      approvedPlan: (rawBrief?.approvedPlan ?? fallbackPlan).filter((s) => typeof s === 'string' && s.trim()).slice(0, 6),
      constraints: (rawBrief?.constraints ?? []).filter((s) => typeof s === 'string' && s.trim()).slice(0, 4),
      expectedOutcome:
        rawBrief?.expectedOutcome?.trim() ||
        safeBullets[0] ||
        spec.slice(0, 200) ||
        lastUser,
      avoidChanging: (rawBrief?.avoidChanging ?? []).filter((s) => typeof s === 'string' && s.trim()).slice(0, 4),
    };
    if (executionBrief.approvedPlan.length === 0) {
      executionBrief.approvedPlan = [executionBrief.userRequest];
    }

    return {
      kind: 'ready',
      summary: safeBullets[0] ?? '',
      planBulletsBg: safeBullets,
      spec: spec || `Apply the change requested by the user using best judgement.\n${bullets.join('\n')}`,
      targetFiles: finalTargets,
      nonGoals,
      executionBrief,
    };
  }

  // Failed JSON parse: fall back gracefully.
  if (!data?.success) {
    if (shouldAutoProceed) {
      return readyFromModel([], '', undefined, undefined);
    }
    const fallbackQ = buildContextualClarifyQuestion(lastUser);
    if (!fallbackQ) return readyFromModel([], '', undefined, undefined);
    return { kind: 'question', message: fallbackQ };
  }

  const v = data.data;

  // Model returned a question.
  if (!v.ready) {
    if (shouldAutoProceed) {
      const bullets = normalizePlanBulletsBg(v.planBulletsBg);
      return readyFromModel(bullets, (v.spec ?? '').trim(), v.targetFiles, v.executionBrief);
    }
    const q = (v.question ?? '').trim();
    if (q) return { kind: 'question', message: q };
    const fallbackQ = buildContextualClarifyQuestion(lastUser);
    if (!fallbackQ) {
      const bullets = normalizePlanBulletsBg(v.planBulletsBg);
      return readyFromModel(bullets, (v.spec ?? '').trim(), v.targetFiles, v.executionBrief);
    }
    return { kind: 'question', message: fallbackQ };
  }

  // Model is ready. Make sure we have the minimum payload.
  const bullets = normalizePlanBulletsBg(v.planBulletsBg);
  const spec = (v.spec ?? '').trim();
  if (!spec && !shouldAutoProceed) {
    const fallbackQ = buildContextualClarifyQuestion(lastUser);
    if (!fallbackQ) return readyFromModel(bullets, spec, v.targetFiles, v.executionBrief);
    return { kind: 'question', message: fallbackQ };
  }
  return readyFromModel(bullets, spec, v.targetFiles, v.executionBrief);
}
