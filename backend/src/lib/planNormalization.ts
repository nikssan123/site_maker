function normalizePlanLanguages(languages: unknown): string[] {
  const values = Array.isArray(languages) ? languages : [];
  const normalized = Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  return normalized.includes('bg') ? normalized : ['bg', ...normalized];
}

function normalizeDataModels(value: unknown): Array<{ name: string; fields: string[] }> | undefined {
  if (!Array.isArray(value)) return undefined;

  return value
    .filter((model): model is { name: string; fields: unknown[] } => {
      if (!model || typeof model !== 'object') return false;
      const row = model as Record<string, unknown>;
      return typeof row.name === 'string' && Array.isArray(row.fields);
    })
    .map((model) => ({
      name: model.name.trim(),
      fields: model.fields.filter((field): field is string => typeof field === 'string' && field.trim().length > 0),
    }))
    .filter((model) => model.name.length > 0);
}

export function normalizePlanDataForPersistence(planData: unknown): Record<string, unknown> {
  const base =
    planData && typeof planData === 'object' && !Array.isArray(planData)
      ? { ...(planData as Record<string, unknown>) }
      : {};

  if ('languages' in base) {
    base.languages = normalizePlanLanguages(base.languages);
  }

  const appType = typeof base.appType === 'string' ? base.appType.trim().toLowerCase() : '';
  if (appType !== 'booking') return base;

  base.hasDatabase = true;

  const dataModels = normalizeDataModels(base.dataModels) ?? [];
  const hasCanonicalTakenSlots = dataModels.some(
    (model) => model.name.trim().toLowerCase() === 'takenslots',
  );

  if (!hasCanonicalTakenSlots) {
    dataModels.push({
      name: 'takenSlots',
      fields: ['date', 'time', 'note'],
    });
  }

  base.dataModels = dataModels;
  return base;
}

