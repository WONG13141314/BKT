import { AlarmScheduler } from '../scheduler';

describe('persisted room alarm deadlines', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(1_000));
  afterEach(() => jest.useRealTimers());

  it('retains an absolute deadline when callbacks are rebuilt after hibernation', () => {
    const beforeSleep = new AlarmScheduler();
    beforeSleep.setTimeout(jest.fn(), 5_000, 'challenge:room-1');
    const saved = beforeSleep.snapshot();
    jest.setSystemTime(4_000);
    const awake = new AlarmScheduler(saved);
    const resolveChallenge = jest.fn();
    expect(awake.next()).toBeNull(); // Stored deadlines alone cannot execute a callback.
    awake.rehydrate(() => {
      awake.clearTimeout('challenge:room-1');
      awake.setTimeout(resolveChallenge, 5_000, 'challenge:room-1');
    });
    expect(awake.next()).toBe(6_000);
    awake.runDue(5_999);
    expect(resolveChallenge).not.toHaveBeenCalled();
    awake.runDue(6_000);
    expect(resolveChallenge).toHaveBeenCalledTimes(1);
    expect(awake.next()).toBeNull();
  });

  it('runs an overdue saved deadline once and removes timers the restored phase no longer needs', () => {
    const awake = new AlarmScheduler([
      { key: 'challenge:room-1', at: 800 },
      { key: 'obsolete-bot-action', at: 900 },
    ]);
    const timeout = jest.fn();
    awake.rehydrate(() => awake.setTimeout(timeout, 10_000, 'challenge:room-1'));
    expect(awake.snapshot()).toEqual([{ key: 'challenge:room-1', at: 800 }]);
    awake.runDue();
    awake.runDue();
    expect(timeout).toHaveBeenCalledTimes(1);
    expect(awake.snapshot()).toEqual([]);
  });

  it('cancels a pending phase and gives its replacement a fresh deadline', () => {
    const scheduler = new AlarmScheduler();
    const oldPhase = jest.fn();
    const newPhase = jest.fn();
    const handle = scheduler.setTimeout(oldPhase, 200, 'phase:room-1');
    jest.setSystemTime(1_100);
    scheduler.clearTimeout(handle);
    scheduler.setTimeout(newPhase, 400, 'phase:room-1');
    scheduler.runDue(1_200);
    expect(oldPhase).not.toHaveBeenCalled();
    expect(newPhase).not.toHaveBeenCalled();
    expect(scheduler.next()).toBe(1_500);
    scheduler.runDue(1_500);
    expect(newPhase).toHaveBeenCalledTimes(1);
  });

  it('updates a callback without postponing an already armed deadline', () => {
    const scheduler = new AlarmScheduler();
    const original = jest.fn();
    const replacement = jest.fn();
    scheduler.setTimeout(original, 200, 'phase:room-1');
    jest.setSystemTime(1_100);
    scheduler.setTimeout(replacement, 500, 'phase:room-1');
    scheduler.runDue(1_200);
    expect(original).not.toHaveBeenCalled();
    expect(replacement).toHaveBeenCalledTimes(1);
  });

  it('processes deadlines in order and defers timers created by a callback until the next alarm', () => {
    const scheduler = new AlarmScheduler();
    const calls: string[] = [];
    scheduler.setTimeout(() => calls.push('latest'), 30, 'latest');
    scheduler.setTimeout(() => {
      calls.push('earliest');
      scheduler.setTimeout(() => calls.push('created-during-alarm'), 0, 'new');
    }, 10, 'earliest');
    scheduler.setTimeout(() => calls.push('middle'), 20, 'middle');
    jest.setSystemTime(1_040);
    scheduler.runDue();
    expect(calls).toEqual(['earliest', 'middle', 'latest']);
    expect(scheduler.next()).toBe(1_040);
    scheduler.runDue();
    expect(calls).toEqual(['earliest', 'middle', 'latest', 'created-during-alarm']);
  });

  it('does not run a timer that an earlier callback cancels and replaces', () => {
    const scheduler = new AlarmScheduler();
    const cancelled = jest.fn();
    const replacement = jest.fn();
    scheduler.setTimeout(() => {
      scheduler.clearTimeout('later');
      scheduler.setTimeout(replacement, 100, 'later');
    }, 10, 'first');
    scheduler.setTimeout(cancelled, 20, 'later');
    jest.setSystemTime(1_030);
    scheduler.runDue();
    expect(cancelled).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
    expect(scheduler.next()).toBe(1_130);
    scheduler.runDue(1_130);
    expect(replacement).toHaveBeenCalledTimes(1);
  });

  it('defers a replacement even when its key and absolute timestamp match the cancelled timer', () => {
    const scheduler = new AlarmScheduler();
    const cancelled = jest.fn();
    const replacement = jest.fn();
    scheduler.setTimeout(() => {
      scheduler.clearTimeout('same-time');
      scheduler.setTimeout(replacement, 0, 'same-time');
    }, 0, 'first');
    scheduler.setTimeout(cancelled, 0, 'same-time');
    scheduler.runDue();
    expect(cancelled).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
    expect(scheduler.next()).toBe(1_000);
    scheduler.runDue();
    expect(replacement).toHaveBeenCalledTimes(1);
  });
});
