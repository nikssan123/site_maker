export function buildFileTree(paths: string[], maxLines = 600): string {
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
