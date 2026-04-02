import archiver from 'archiver';
import { Response } from 'express';
import path from 'path';

const BASE_DIR = process.env.GENERATED_APPS_DIR ?? '/generated-apps';

/** Directories that should never be included in the user download. */
const EXCLUDED_DIRS = ['node_modules', 'dist', '.pnpm'];

export function streamProjectZip(projectId: string, res: Response): void {
  const projectDir = path.join(BASE_DIR, projectId);

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="project-${projectId}.zip"`,
  );

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    throw err;
  });

  archive.pipe(res);

  // Use glob to include all source files while excluding build artefacts.
  // Users run `npm install && npm run build` after extracting — no need to ship
  // hundreds of MB of node_modules or stale dist output.
  archive.glob('**', {
    cwd: projectDir,
    ignore: EXCLUDED_DIRS.flatMap((d) => [d, `${d}/**`]),
    dot: true, // include dotfiles (.gitignore, .env.example, etc.)
  });

  archive.finalize();
}
