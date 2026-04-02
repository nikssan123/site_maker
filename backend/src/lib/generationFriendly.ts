/** Стъпки в UI (нетехнически). */
export const GEN_STEP_LABELS: Record<number, string> = {
  1: 'Генериране на код',
  2: 'Запазване на проекта',
  3: 'Подготовка',
  4: 'Проверка',
  5: 'Стартиране на приложението',
};

/** Съобщения по време на първия опит за генериране (стъпка 1). */
export const GEN_WORKING_ON_AI_FIRST = [
  'Работим върху превръщането на идеята ви в екрани, с които може да взаимодействате…',
  'Работим върху оформлението и цветовете според описанието ви…',
  'Работим върху бутони, менюта и връзките между частите…',
  'Работим върху детайлите — формуляри, списъци и дребните неща…',
  'Работим върху сглобяването — благодарим за търпението…',
] as const;

export const GEN_WORKING_ON_AI_RETRY = [
  'Работим върху втори опит, за да подредим всичко както трябва…',
  'Работим върху опростяване, за да се получи ясно приложение…',
  'Работим по въпроса — искаме това да работи за вас…',
] as const;

export const GEN_WORKING_ON_STEP: Record<number, string> = {
  2: 'Работим върху безопасното подреждане на файловете на приложението…',
  3: 'Работим върху събирането на нужните части зад кулисите…',
  4: 'Работим върху проверката, че всичко се компилира без проблеми…',
  5: 'Работим върху стартирането, за да го пробвате в прегледа…',
};

export const GEN_FIXING_FRIENDLY = (attempt: number) =>
  `Работим върху отстраняване на проблем (опит ${attempt} от 5)…`;

export const GEN_INITIAL_CODEGEN =
  'Работим върху превръщането на описанието ви в реално приложение…';

export const GEN_INITIAL_RETRY =
  'Работим върху втори опит, за да доставим приложението…';

/** Third pass: model re-formats messy output into strict {"files":...} JSON. */
export const GEN_JSON_REPAIR_INITIAL =
  'Работим върху извличане и оправяне на структурата на генерирания код…';

export const GEN_JSON_REPAIR_ROTATING = [
  'Работим върху преформатиране на отговора във валиден проект…',
  'Работим върху оправяне на формата, за да продължи създаването…',
] as const;

/** After refresh or server restart — pipeline continues from install using saved files. */
export const GEN_RESUME_CONTINUING =
  'Продължаваме от запазения проект (инсталиране и компилация)…';

export const GEN_WRAP_UP_STEP = 'Работим върху финализиране на тази стъпка…';

export const GEN_FINISHING_ALMOST = 'Работим върху финала — почти сте готови…';

export const GEN_INVALID_JSON_DETAIL =
  'Невалиден JSON от ИИ — очаква се един обект {"files":{...}} (без суров код извън JSON)';

export const GEN_INVALID_JSON_USER_MSG =
  '**Създаването спря:** ИИ не върна валидни данни за проекта (очаква се един JSON обект с карта `files`). Опитайте **Създай** отново или първо коригирайте плана в чата.\n\nАко продължава, опростете идеята или проверете логовете на сървъра.';

export const GEN_SSE_CODEGEN_FAIL = 'Генерирането на код неуспешно или прекъснато по време';

export const GEN_SSE_CODEGEN_RETRY_FAIL = 'Повторното генериране на код неуспешно или прекъснато по време';

export const GEN_SSE_INSTALL_FAIL = 'Инсталирането на зависимости неуспешно';

export const GEN_SSE_FIX_BUILD_FAIL = 'Неуспех при автоматично поправяне след максимален брой опити';

export const GEN_SSE_FIX_RUN_FAIL = 'Неуспех при стартиране след автоматично поправяне';

/** Съобщения към потребителя при failGeneration (markdown). */
export function genUserMsgBuildStopped(detail: string): string {
  return `**Създаването спря:** ${detail}`;
}

export function genUserMsgBuildStoppedRetry(detail: string): string {
  return `**Създаването спря (повторен опит):** ${detail}`;
}

export function genUserMsgInstallFail(log: string): string {
  return `**Инсталирането на зависимости неуспя.**\n\n\`\`\`\n${log.slice(0, 8000)}${log.length > 8000 ? '\n…' : ''}\n\`\`\``;
}

export function genUserMsgBuildFailAfterFix(log: string): string {
  return `**Компилацията неуспя** след автоматични опити за поправка.\n\n\`\`\`\n${log.slice(0, 8000)}${log.length > 8000 ? '\n…' : ''}\n\`\`\``;
}

export function genUserMsgRunFailAfterFix(log: string): string {
  return `**Приложението не можа да стартира** след автоматични опити за поправка.\n\n\`\`\`\n${log.slice(0, 8000)}${log.length > 8000 ? '\n…' : ''}\n\`\`\``;
}

export function genUserMsgGenerationFailed(err: string): string {
  return `**Създаването неуспя:** ${err}`;
}

/** Итерация — съобщения за напредък. */
export const ITERATE_AI_HINTS = [
  'Работим върху разбирането на промяната и актуализиране на нужните части…',
  'Работим върху екраните и логиката, за да останат синхронизирани…',
  'Работим по въпроса — почти готово за нова компилация…',
] as const;

export const ITERATE_READING_REQUEST = 'Работим върху актуализацията — четем какво поискахте…';

export const ITERATE_SAVING_BUILD = 'Работим върху запазване на промените и подготовка за нова компилация…';

export const ITERATE_VERIFY_BUILD = 'Работим върху проверка, че всичко още се компилира чисто…';

export const ITERATE_LAUNCH_PREVIEW = 'Работим върху стартиране на прегледа с промените…';

export const ITERATE_FINISHING = 'Работим върху финализиране…';
