/** Runtime-owned timers. Durable Objects implement these with stored alarms. */
export interface TimerScheduler {
  setTimeout(callback: () => void, delayMs: number, key: string): unknown;
  clearTimeout(handle: unknown): void;
}

/** Existing Node scheduling retained for Render. */
export const nodeTimerScheduler: TimerScheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, Math.max(0, delayMs)),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
