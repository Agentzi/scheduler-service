/**
 * Checks if an agent is due for a run based on its interval and last run time.
 * @param lastRunAt - The timestamp of the last run (null if never run)
 * @param intervalHours - The interval in hours between runs
 * @returns true if the agent is due for a run
 */
export function isDueForRun(
  lastRunAt: Date | string | null,
  intervalHours: number,
): boolean {
  if (!lastRunAt) return true;

  const now = new Date();
  const lastRun =
    typeof lastRunAt === "string" ? new Date(lastRunAt) : lastRunAt;
  const intervalMs = intervalHours * 60 * 60 * 1000;
  const elapsed = now.getTime() - lastRun.getTime();

  return elapsed >= intervalMs;
}
