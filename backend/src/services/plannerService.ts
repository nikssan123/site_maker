import { prisma } from '../index';
import { getChatClient, ChatMessage } from './aiClient';
import { PLANNER_SYSTEM_LOCALIZED } from '../lib/prompts';

// Matches ```plan ... ``` or ```json ... ``` code fences, and legacy <PLAN>...</PLAN> tags.
// GPT-4o sometimes uses ```json instead of ```plan.
const PLAN_REGEX = /```(?:plan|json)\s*([\s\S]*?)```|<PLAN>([\s\S]*?)<\/PLAN>/i;

/** Model often copies typographic quotes from training; normalize so JSON.parse works. */
function normalizeFenceJson(raw: string): string {
  return raw
    .replace(/\u201c|\u201d|\u201e|\u00ab|\u00bb/g, '"')
    .replace(/\u2018|\u2019/g, "'");
}

function matchPlanFence(fullResponse: string): RegExpMatchArray | null {
  return fullResponse.match(PLAN_REGEX);
}

function extractPlanFence(fullResponse: string): string | null {
  const match = matchPlanFence(fullResponse);
  if (!match) return null;
  return normalizeFenceJson((match[1] ?? match[2]).trim());
}

function parsePlanData(jsonStr: string): unknown {
  return JSON.parse(jsonStr);
}

/** User signals they are happy to proceed (BG + EN) — model may omit ```plan``` unless we retry. */
function userSignalsReadyToPlan(userMessage: string): boolean {
  const t = userMessage.trim();
  if (!t) return false;
  if (
    /^(супер|идеално|чудесно|перфектно|добре|ок|окей|да|давай|хайде|готово|нека|браво|страхотно|точно|точно така|съгласен|съгласна|приемам|харесва ми|разбрах|ясно|оки|yes|ok|okay|cool|great|perfect|sounds good|let'?s go|go ahead|do it|nice|awesome|love it)[\s!.?…]*$/i.test(
      t,
    )
  ) {
    return true;
  }
  return /\b(build|let'?s build|generate|make it|create it|start building|създай|направи го|готово|продължи)\b/i.test(
    userMessage,
  );
}

/** Assistant said it is summarizing / presenting a plan but often forgets the machine block. */
function assistantPromisedPlanInProse(response: string): boolean {
  if (/\b(short plan|here'?s (a )?plan|plan (for|includes)|what the site will include)\b/i.test(response)) {
    return true;
  }
  // Bulgarian: "Ето един кратък план за това, което сайтът ще включва" etc.
  if (/кратък план|ето\s+един\s+план|план за (това|сайта)/i.test(response)) return true;
  if (/(сайтът ще включва|ще включва|раздели|екрани|секции).{0,80}(началн|каталог|контакт|детайл)/i.test(response)) {
    return true;
  }
  return false;
}

function shouldRetryForPlanBlock(userMessage: string, response: string): boolean {
  const fenceJson = extractPlanFence(response);
  if (fenceJson) {
    try {
      const data = parsePlanData(fenceJson) as { appType?: string };
      if (data && typeof data.appType === 'string') return false;
    } catch {
      /* invalid JSON — need retry */
    }
  }
  return userSignalsReadyToPlan(userMessage) || assistantPromisedPlanInProse(response);
}

const FORCE_PLAN_APPENDIX = `

CRITICAL: Your previous reply did not include a valid machine-readable plan block, or it was broken.
You MUST end this message with the internal \`\`\`plan\`\`\` JSON block exactly as specified in the system instructions.
Use straight ASCII " quotes only inside JSON. Keep your Bulgarian (or other) friendly text above the fence; put ONLY valid JSON inside \`\`\`plan ... \`\`\`.`;

export async function chat(
  sessionId: string,
  userId: string,
  userMessage: string,
) {
  // Ensure session belongs to user
  const session = await prisma.session.findFirst({
    where: { id: sessionId, userId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });

  if (!session) throw new Error('Session not found');

  // Save user message
  await prisma.message.create({
    data: { sessionId, role: 'user', content: userMessage },
  });

  const history: ChatMessage[] = session.messages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));
  history.push({ role: 'user', content: userMessage });

  const ai = getChatClient();
  let response = await ai.complete(history, PLANNER_SYSTEM_LOCALIZED);

  if (shouldRetryForPlanBlock(userMessage, response)) {
    const forcePlanSystem = `${PLANNER_SYSTEM_LOCALIZED}${FORCE_PLAN_APPENDIX}`;
    response = await ai.complete(history, forcePlanSystem);
  }

  // Strip plan fences before saving and displaying
  const displayText = response.replace(PLAN_REGEX, '').trim();

  // Save assistant response (without plan block)
  await prisma.message.create({
    data: { sessionId, role: 'assistant', content: displayText },
  });

  // Check if plan was produced
  const fenceJson = extractPlanFence(response);
  let plan = null;

  if (fenceJson) {
    try {
      const planData = parsePlanData(fenceJson) as { appType?: string };

      // Only accept as a valid plan if it has the expected appType field
      // (prevents a stray ```json block from being mistaken for a plan)
      if (planData && typeof planData.appType === 'string') {
        // Upsert plan (replace if already exists and not locked)
        const existing = await prisma.plan.findUnique({ where: { sessionId } });
        if (!existing || !existing.locked) {
          plan = await prisma.plan.upsert({
            where: { sessionId },
            create: { sessionId, data: planData },
            update: { data: planData },
          });
        } else {
          plan = existing;
        }
      }
    } catch (e) {
      console.error('[planner] Failed to extract plan from response:', e);
    }
  }

  return { message: displayText, plan };
}

export async function lockPlan(planId: string, userId: string) {
  const plan = await prisma.plan.findUniqueOrThrow({
    where: { id: planId },
    include: { session: true },
  });

  if (plan.session.userId !== userId) throw new Error('Forbidden');

  return prisma.plan.update({
    where: { id: planId },
    data: { locked: true },
  });
}
