/**
 * Just enough IndexedDB for the baseline's raw-stream store, in memory.
 *
 * jsdom has none, and this repo has no fake-indexeddb, so the tests that
 * cared stubbed `indexedDB` with a hand-made object (`ephemeralStore`,
 * `StudentShell`). This is the same idea, with what `capture.ts` uses: `open`
 * with an upgrade, `databases`, one store with `put`, `delete`, `clear`,
 * `getAllKeys` and a cursor, and a transaction that completes once its
 * requests have. Every callback lands on a later task, as a real one does.
 *
 *   const idb = fakeIndexedDb();
 *   vi.stubGlobal("indexedDB", idb.factory);
 *   ...
 *   vi.unstubAllGlobals();
 */

type Records = Map<IDBValidKey, unknown>;

interface Req<T> {
  result: T;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onupgradeneeded?: (() => void) | null;
}

const later = (fn: () => void) => {
  setTimeout(fn, 0);
};

function request<T>(initial: T): Req<T> {
  return { result: initial, onsuccess: null, onerror: null };
}

export function fakeIndexedDb() {
  /** Every database on the "device", by name, each one store's records. */
  const databases = new Map<string, Records>();

  function connection(records: Records) {
    return {
      objectStoreNames: { contains: () => true },
      createObjectStore: () => ({}),
      close: () => {},
      transaction: () => {
        let pending = 0;
        const tx = {
          oncomplete: null as (() => void) | null,
          onerror: null as (() => void) | null,
          onabort: null as (() => void) | null,
          objectStore: () => store,
        };
        const settle = () =>
          later(() => {
            if (pending === 0) tx.oncomplete?.();
          });
        const op = <T>(run: () => T): Req<T | undefined> => {
          pending += 1;
          const req = request<T | undefined>(undefined);
          later(() => {
            req.result = run();
            req.onsuccess?.();
            pending -= 1;
            settle();
          });
          return req;
        };
        const store = {
          put: (value: unknown, key: IDBValidKey) =>
            op(() => {
              records.set(key, structuredClone(value));
            }),
          delete: (key: IDBValidKey) =>
            op(() => {
              records.delete(key);
            }),
          clear: () =>
            op(() => {
              records.clear();
            }),
          getAllKeys: () => op(() => [...records.keys()]),
          openCursor: () => {
            pending += 1;
            const keys = [...records.keys()];
            let i = 0;
            const req = request<unknown>(null);
            const step = () =>
              later(() => {
                if (i >= keys.length) {
                  req.result = null;
                  req.onsuccess?.();
                  pending -= 1;
                  settle();
                  return;
                }
                const key = keys[i];
                i += 1;
                req.result = {
                  key,
                  value: records.get(key),
                  delete: () => records.delete(key),
                  continue: step,
                };
                req.onsuccess?.();
              });
            step();
            return req;
          },
        };
        settle();
        return tx;
      },
    };
  }

  const factory = {
    open: (name: string) => {
      const req = request<unknown>(null);
      req.onupgradeneeded = null;
      later(() => {
        const fresh = !databases.has(name);
        if (fresh) databases.set(name, new Map());
        req.result = connection(databases.get(name)!);
        if (fresh) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
    databases: async () =>
      [...databases.keys()].map((name) => ({ name, version: 1 })),
    deleteDatabase: (name: string) => {
      const req = request<undefined>(undefined);
      later(() => {
        databases.delete(name);
        req.onsuccess?.();
      });
      return req;
    },
  };

  return {
    factory,
    /** The records of one database, or undefined if it was never created. */
    records: (name: string) => databases.get(name),
    /** Put a database on the "device" as an earlier page left it. */
    seed: (name: string, entries: [IDBValidKey, unknown][]) => {
      databases.set(name, new Map(entries));
    },
  };
}
