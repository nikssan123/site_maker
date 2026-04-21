import { prisma } from '../index';
import { writeProjectFiles } from '../lib/fileWriter';
import { Prisma } from '@prisma/client';

type SnapshotSource = 'iteration' | 'admin_import' | 'manual_restore' | 'repair';

export async function createProjectSnapshot(input: {
  projectId: string;
  userId?: string;
  source: SnapshotSource;
  reason?: string;
}) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: input.projectId },
  });

  return prisma.projectSnapshot.create({
    data: {
      projectId: project.id,
      userId: input.userId,
      source: input.source,
      reason: input.reason?.slice(0, 4000),
      files: project.files as Prisma.InputJsonValue,
      status: project.status,
      runPort: project.runPort,
      buildLog: project.buildLog,
      errorLog: project.errorLog,
    },
  });
}

export async function restoreProjectSnapshot(snapshotId: string) {
  const snapshot = await prisma.projectSnapshot.findUniqueOrThrow({
    where: { id: snapshotId },
  });
  const files = snapshot.files as Record<string, string>;

  await writeProjectFiles(snapshot.projectId, files);
  await prisma.project.update({
    where: { id: snapshot.projectId },
    data: {
      files,
      status: snapshot.status,
      runPort: snapshot.runPort,
      buildLog: snapshot.buildLog,
      errorLog: snapshot.errorLog,
    },
  });

  return snapshot;
}
