/** Runtime-owned timers. Durable Objects implement these with stored alarms. */
export interface TimerScheduler {
  setTimeout(callback: () => void, delayMs: number, key: string): unknown;
  clearTimeout(handle: unknown): void;
}

/** Platform timers for standalone rule tests; live rooms inject stored alarms. */
export const defaultTimerScheduler: TimerScheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, Math.max(0, delayMs)),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
