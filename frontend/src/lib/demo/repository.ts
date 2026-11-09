import { assertDemoState, createDemoState, type DemoState } from "./model";
import { applyCommand, type CommandEnvelope } from "./operations";

export const DEMO_DATABASE = "mybuild-autonomous-demo";
const STORE = "world";
const KEY = "current";

export class DemoRepository {
  private connection: Promise<IDBDatabase> | null = null;
  constructor(private readonly factory: IDBFactory = indexedDB, private readonly name = DEMO_DATABASE) {}

  private open(): Promise<IDBDatabase> {
    if (this.connection) return this.connection;
    this.connection = new Promise((resolve, reject) => {
      const request = this.factory.open(this.name, 1);
      let settled = false;
      const timeout = setTimeout(() => fail(new Error("Хранилище браузера не отвечает. Повторите открытие или продолжите без сохранения.")), 8000);
      const fail = (error: Error) => { settled = true; clearTimeout(timeout); reject(error); };
      request.onupgradeneeded = () => { request.result.createObjectStore(STORE); };
      request.onblocked = () => fail(new Error("Закройте другие вкладки MyBuild и повторите открытие."));
      request.onerror = () => fail(request.error ?? new Error("Хранилище браузера недоступно."));
      request.onsuccess = () => {
        const db = request.result;
        if (settled) { db.close(); return; }
        settled = true;
        clearTimeout(timeout);
        db.onversionchange = () => { db.close(); this.connection = null; };
        resolve(db);
      };
    });
    this.connection.catch(() => { this.connection = null; });
    return this.connection;
  }

  private async transaction(change?: (state: DemoState) => DemoState, reset = false): Promise<DemoState> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const request = store.get(KEY);
      let result: DemoState;
      let failure: unknown;
      request.onsuccess = () => {
        try {
          const saved: unknown = request.result;
          result = reset || saved === undefined ? createDemoState() : (assertDemoState(saved), saved);
          if (change) result = change(result);
          if (reset || saved === undefined || change) store.put(result, KEY);
        } catch (error) { failure = error; tx.abort(); }
      };
      // Resolve only after commit, never after a successful put request.
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure ?? tx.error ?? new Error("Не удалось сохранить изменения. Проверьте свободное место в браузере."));
      tx.onerror = () => { failure ??= tx.error; };
    });
  }

  read() { return this.transaction(); }
  execute(envelope: CommandEnvelope) { return this.transaction((state) => applyCommand(state, envelope)); }
  reset() { return this.transaction(undefined, true); }
  async close() { if (this.connection) (await this.connection).close(); this.connection = null; }
}
