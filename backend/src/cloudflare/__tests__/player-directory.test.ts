import { PlayerDirectory } from '../player-directory';

interface Membership { code: string | null; version: number }

function harness() {
  let membership: Membership | undefined;
  let tail: Promise<unknown> = Promise.resolve();
  const storage = {
    get: jest.fn(async () => structuredClone(membership)),
    transaction: jest.fn((operation: (transaction: DurableObjectTransaction) => Promise<unknown>) => {
      const run = tail.then(async () => {
        let next = structuredClone(membership);
        const transaction = {
          get: async () => structuredClone(next),
          put: async (_key: string, value: Membership) => { next = structuredClone(value); },
        } as unknown as DurableObjectTransaction;
        const result = await operation(transaction);
        membership = next;
        return result;
      });
      tail = run.catch(() => {});
      return run;
    }),
  };
  const directory = new PlayerDirectory({ storage } as unknown as DurableObjectState, {});
  const current = async () => (await directory.fetch(new Request('https://directory/current'))).json();
  const claim = async (code: string) => (await directory.fetch(new Request('https://directory/claim', {
    method: 'POST', body: JSON.stringify({ code }),
  }))).json() as Promise<{ code: string; previousCode: string | null; version: number }>;
  const restore = async (input: { code: string; previousCode: string | null; version: number }) =>
    (await directory.fetch(new Request('https://directory/restore', {
      method: 'POST', body: JSON.stringify(input),
    }))).json();
  return { directory, storage, current, claim, restore };
}

describe('per-player room directory', () => {
  test('starts unassigned and retains monotonically versioned claims', async () => {
    const { current, claim, storage } = harness();
    expect(await current()).toEqual({ code: null, version: 0 });
    expect(await claim('ABC234')).toEqual({ code: 'ABC234', previousCode: null, version: 1 });
    expect(await claim('ABC234')).toEqual({ code: 'ABC234', previousCode: 'ABC234', version: 2 });
    expect(await claim('DEF567')).toEqual({ code: 'DEF567', previousCode: 'ABC234', version: 3 });
    expect(await current()).toEqual({ code: 'DEF567', version: 3 });
    expect(storage.transaction).toHaveBeenCalledTimes(3);
  });

  test('concurrent claims expose one atomic previous-code chain', async () => {
    const { current, claim } = harness();
    const results = (await Promise.all([claim('ABC234'), claim('DEF567'), claim('GHI789')]))
      .sort((first, second) => first.version - second.version);
    expect(results.map((result) => result.version)).toEqual([1, 2, 3]);
    expect(results[0].previousCode).toBeNull();
    expect(results[1].previousCode).toBe(results[0].code);
    expect(results[2].previousCode).toBe(results[1].code);
    expect(await current()).toEqual({ code: results[2].code, version: 3 });
  });

  test.each(['{', '{}', '[]', '{"code":""}', '{"code":123}', JSON.stringify({ code: 'A'.repeat(101) })])(
    'rejects malformed claims without changing membership: %s', async (body) => {
      const { directory, current, storage } = harness();
      const response = await directory.fetch(new Request('https://directory/claim', { method: 'POST', body }));
      expect(response.status).toBe(400);
      expect(await current()).toEqual({ code: null, version: 0 });
      expect(storage.transaction).not.toHaveBeenCalled();
    },
  );

  test('restores the prior room after a failed claim and advances its version', async () => {
    const { current, claim, restore } = harness();
    await claim('ABC234');
    const failed = await claim('DEF567');
    expect(await restore(failed)).toEqual({ restored: true, code: 'ABC234', version: 3 });
    expect(await current()).toEqual({ code: 'ABC234', version: 3 });
    expect(await restore(failed)).toEqual({ restored: false, code: 'ABC234', version: 3 });
  });

  test('restores an unassigned profile without discarding the monotonic version', async () => {
    const { current, claim, restore } = harness();
    const failed = await claim('ABC234');
    expect(await restore(failed)).toEqual({ restored: true, code: null, version: 2 });
    expect(await current()).toEqual({ code: null, version: 2 });
    expect(await claim('DEF567')).toEqual({ code: 'DEF567', previousCode: null, version: 3 });
  });

  test('refuses a stale restoration after a newer claim, including the same room code', async () => {
    const { current, claim, restore } = harness();
    const failed = await claim('ABC234');
    await claim('DEF567');
    expect(await restore(failed)).toEqual({ restored: false, code: 'DEF567', version: 2 });
    await claim('ABC234');
    expect(await restore(failed)).toEqual({ restored: false, code: 'ABC234', version: 3 });
    expect(await current()).toEqual({ code: 'ABC234', version: 3 });
  });

  test('requires both current code and version to match before restoring', async () => {
    const { current, claim, restore } = harness();
    const failed = await claim('ABC234');
    expect(await restore({ ...failed, code: 'DEF567' })).toEqual({
      restored: false, code: 'ABC234', version: 1,
    });
    expect(await current()).toEqual({ code: 'ABC234', version: 1 });
  });

  test.each([
    '{', '{}', '[]', JSON.stringify({ code: 'ABC234', version: 1 }),
    JSON.stringify({ code: '', version: 1, previousCode: null }),
    JSON.stringify({ code: 'ABC234', version: 0, previousCode: null }),
    JSON.stringify({ code: 'ABC234', version: 1.5, previousCode: null }),
    JSON.stringify({ code: 'ABC234', version: Number.MAX_SAFE_INTEGER + 1, previousCode: null }),
    JSON.stringify({ code: 'ABC234', version: 1, previousCode: 123 }),
  ])('rejects invalid restoration without changing membership: %s', async (body) => {
    const { directory, current, storage } = harness();
    const response = await directory.fetch(new Request('https://directory/restore', { method: 'POST', body }));
    expect(response.status).toBe(400);
    expect(await current()).toEqual({ code: null, version: 0 });
    expect(storage.transaction).not.toHaveBeenCalled();
  });

  test('only exposes the internal claim/current/restore methods', async () => {
    const { directory, storage } = harness();
    expect((await directory.fetch(new Request('https://directory/claim'))).status).toBe(404);
    expect((await directory.fetch(new Request('https://directory/restore'))).status).toBe(404);
    expect((await directory.fetch(new Request('https://directory/unknown'))).status).toBe(404);
    expect(storage.transaction).not.toHaveBeenCalled();
  });
});
