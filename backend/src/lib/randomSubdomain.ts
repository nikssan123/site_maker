import { randomInt } from 'crypto';
import { prisma } from '../index';

const ADJECTIVES = [
  'swift', 'bright', 'silent', 'cosmic', 'gentle', 'noble', 'crystal', 'velvet',
  'amber', 'lunar', 'solar', 'misty', 'fern', 'golden', 'silver', 'hidden',
  'wild', 'royal', 'rapid', 'calm', 'merry', 'brisk', 'bold', 'mellow',
  'sunny', 'frosty', 'humble', 'breezy', 'wandering', 'rustic', 'azure', 'crimson',
];

const NOUNS = [
  'otter', 'falcon', 'meadow', 'harbor', 'comet', 'lantern', 'forest', 'river',
  'pebble', 'horizon', 'orchard', 'canyon', 'spruce', 'aurora', 'glacier', 'echo',
  'beacon', 'cinder', 'ember', 'ridge', 'cliff', 'cove', 'reef', 'dune',
  'willow', 'cedar', 'maple', 'thistle', 'feather', 'flint', 'quartz', 'opal',
];

function pick<T>(arr: readonly T[]): T {
  return arr[randomInt(0, arr.length)]!;
}

/** Generate a friendly subdomain slug like `swift-otter-3274`. */
export function generateRandomSlug(): string {
  const num = randomInt(1000, 10000);
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${num}`;
}

/** Validate the same way the API does (kept in sync with validateSubdomainSlug in preview.ts). */
function isValidSlug(slug: string): boolean {
  if (slug.length < 3 || slug.length > 40) return false;
  if (!/^[a-z0-9-]+$/.test(slug)) return false;
  if (slug.startsWith('-') || slug.endsWith('-')) return false;
  return true;
}

/**
 * Pick a random subdomain that is not already used by another project's `customDomain`.
 * Returns the slug (without root) on success, or null if it could not find a free one.
 */
export async function reserveRandomSubdomain(
  projectId: string,
  rootDomain: string,
  maxAttempts = 8,
): Promise<string | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const slug = generateRandomSlug();
    if (!isValidSlug(slug)) continue;
    const hostname = `${slug}.${rootDomain}`;
    const taken = await prisma.project.findFirst({
      where: { customDomain: hostname, NOT: { id: projectId } },
      select: { id: true },
    });
    if (!taken) return slug;
  }
  return null;
}
