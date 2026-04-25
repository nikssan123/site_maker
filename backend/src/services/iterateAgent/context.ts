export interface AgentContext {
  projectId: string;
  userId: string;
  sessionId: string;
  /** Snapshot taken by the route before the loop started. Used by rollback_last_change. */
  snapshotBeforeId: string;
  /** In-memory mirror of project.files; tool handlers keep this consistent with disk. */
  files: Record<string, string>;
  /** Compact log of last build (after run_build). null until first build. */
  lastBuild: { success: boolean; log: string } | null;
  /** True after the first mutation; used by the orchestrator's finalization gate. */
  hasMutated: boolean;
  mutationCount: number;
}

export function createAgentContext(input: {
  projectId: string;
  userId: string;
  sessionId: string;
  snapshotBeforeId: string;
  files: Record<string, string>;
}): AgentContext {
  return {
    projectId: input.projectId,
    userId: input.userId,
    sessionId: input.sessionId,
    snapshotBeforeId: input.snapshotBeforeId,
    files: { ...input.files },
    lastBuild: null,
    hasMutated: false,
    mutationCount: 0,
  };
}
