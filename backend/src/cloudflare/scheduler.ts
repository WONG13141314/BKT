import type { TimerScheduler } from '../sockets/timer.scheduler';

export interface ScheduledDeadline { key: string; at: number }

/** Callbacks are rebuilt on wake; only their absolute deadlines are persisted. */
export class AlarmScheduler implements TimerScheduler {
  private readonly deadlines = new Map<string, number>();
  private readonly callbacks = new Map<string, () => void>();
  private restoring = false;

  constructor(saved: ScheduledDeadline[] = []) {
    for (const task of saved) this.deadlines.set(task.key, task.at);
  }

  setTimeout(callback: () => void, delayMs: number, key: string): string {
    if (!this.deadlines.has(key)) this.deadlines.set(key, Date.now() + Math.max(0, delayMs));
    this.callbacks.set(key, callback);
    return key;
  }

  clearTimeout(handle: unknown): void {
    if (typeof handle !== 'string') return;
    if (!this.restoring) this.deadlines.delete(handle);
    this.callbacks.delete(handle);
  }

  rehydrate(register: () => void): void {
    this.restoring = true;
    try { register(); } finally { this.restoring = false; }
    for (const key of this.deadlines.keys()) if (!this.callbacks.has(key)) this.deadlines.delete(key);
  }

  snapshot(): ScheduledDeadline[] {
    return [...this.deadlines].map(([key, at]) => ({ key, at }));
  }

  next(): number | null {
    const active = [...this.deadlines].filter(([key]) => this.callbacks.has(key));
    return active.length ? Math.min(...active.map(([, at]) => at)) : null;
  }

  /** Run a bounded, ordered batch. New timers remain for the next alarm. */
  runDue(now = Date.now()): void {
    const due = [...this.deadlines]
      .filter(([key, at]) => at <= now && this.callbacks.has(key))
      .sort((a, b) => a[1] - b[1])
      .map(([key, at]) => ({ key, at, callback: this.callbacks.get(key) }));
    for (const { key, at, callback } of due) {
      if (this.deadlines.get(key) !== at || this.callbacks.get(key) !== callback) continue;
      this.clearTimeout(key);
      callback?.();
    }
  }
}
