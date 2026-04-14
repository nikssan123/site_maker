import axios from 'axios';

const APP_RUNNER_URL = process.env.APP_RUNNER_URL ?? 'http://app-runner:4001';

export interface RunnerResult {
  success: boolean;
  log: string;
  port?: number;
}

export async function installDeps(projectId: string): Promise<RunnerResult> {
  const { data } = await axios.post<RunnerResult>(
    `${APP_RUNNER_URL}/install`,
    { projectId },
    { timeout: 120_000 },
  );
  return data;
}

export async function buildProject(projectId: string): Promise<RunnerResult> {
  const { data } = await axios.post<RunnerResult>(
    `${APP_RUNNER_URL}/build`,
    { projectId },
    { timeout: 120_000 },
  );
  return data;
}

export async function buildHostedProject(projectId: string): Promise<RunnerResult> {
  const { data } = await axios.post<RunnerResult>(
    `${APP_RUNNER_URL}/build-hosted`,
    { projectId },
    { timeout: 120_000 },
  );
  return data;
}

export async function runProject(projectId: string): Promise<RunnerResult> {
  const { data } = await axios.post<RunnerResult>(
    `${APP_RUNNER_URL}/run`,
    { projectId },
    { timeout: 30_000 },
  );
  return data;
}

export async function stopProject(projectId: string): Promise<void> {
  await axios.post(`${APP_RUNNER_URL}/stop`, { projectId }).catch(() => {});
}

export async function ensureRunning(projectId: string): Promise<RunnerResult> {
  const { data } = await axios.post<RunnerResult>(
    `${APP_RUNNER_URL}/ensure-running`,
    { projectId },
    { timeout: 60_000 },
  );
  return data;
}

export async function startPersistentHosting(
  projectId: string,
  envVars: Record<string, string>,
): Promise<RunnerResult> {
  const { data } = await axios.post<RunnerResult>(
    `${APP_RUNNER_URL}/start-persistent`,
    { projectId, envVars },
    { timeout: 60_000 },
  );
  return data;
}

export async function stopPersistentHosting(projectId: string): Promise<void> {
  await axios.post(`${APP_RUNNER_URL}/stop-persistent`, { projectId }).catch(() => {});
}
