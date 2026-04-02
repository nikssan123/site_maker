import fs from 'fs/promises';
import path from 'path';

const BASE_DIR = process.env.GENERATED_APPS_DIR ?? '/generated-apps';

export async function writeProjectFiles(
  projectId: string,
  files: Record<string, string>,
): Promise<void> {
  const projectDir = path.join(BASE_DIR, projectId);
  await fs.mkdir(projectDir, { recursive: true });

  await Promise.all(
    Object.entries(files).map(async ([filePath, content]) => {
      const fullPath = path.join(projectDir, filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf8');
    }),
  );
}

export function projectPath(projectId: string): string {
  return path.join(BASE_DIR, projectId);
}
