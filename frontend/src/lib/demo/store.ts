"use client";

import { createDemoState, type DemoState } from "./model";
import { applyCommand, type DemoCommand } from "./operations";
import { DemoRepository } from "./repository";

interface Snapshot {
  state: DemoState | null;
  actorId: string | null;
  mode: "persistent" | "memory";
  error: string | null;
}
const initial: Snapshot = { state: null, actorId: null, mode: "persistent", error: null };
let snapshot = initial;
let repository: DemoRepository | null = null;
let initializing: Promise<void> | null = null;
let storageEpoch = 0;
const listeners = new Set<() => void>();
const ACTOR_KEY = "mybuild-demo-actor";

function emit(next: Snapshot) { snapshot = next; listeners.forEach((listener) => listener()); }
function publish(state: DemoState) {
  if (snapshot.state?.generation === state.generation && snapshot.state.revision > state.revision) return;
  emit({ ...snapshot, state, error: null });
}
export function errorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "QuotaExceededError") return "В браузере недостаточно места. Изменения не сохранены.";
  return error instanceof Error ? error.message : "Не удалось открыть локальные данные.";
}
export const subscribeDemo = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getDemoSnapshot = () => snapshot;
export const getServerDemoSnapshot = () => initial;

export function initializeDemo(): Promise<void> {
  if (initializing) return initializing;
  initializing = (async () => {
    const epoch = storageEpoch;
    try {
      let actorId: string | null = null;
      try { actorId = sessionStorage.getItem(ACTOR_KEY); } catch { /* Selection can remain in memory. */ }
      emit({ ...snapshot, actorId });
      repository = new DemoRepository();
      const state = await repository.read();
      if (epoch === storageEpoch) publish(state);
    } catch (error) { if (epoch === storageEpoch) emit({ ...snapshot, error: errorMessage(error) }); }
  })();
  return initializing;
}

export function chooseActor(actorId: string | null) {
  if (actorId && !snapshot.state?.users.some((user) => user.id === actorId)) return;
  try { if (actorId) sessionStorage.setItem(ACTOR_KEY, actorId); else sessionStorage.removeItem(ACTOR_KEY); } catch { /* Optional persistence. */ }
  emit({ ...snapshot, actorId });
}

export async function reloadDemo() {
  if (snapshot.mode === "memory") return;
  const epoch = storageEpoch;
  try { const state = await (repository ??= new DemoRepository()).read(); if (epoch === storageEpoch) publish(state); }
  catch (error) { if (epoch === storageEpoch) emit({ ...snapshot, error: errorMessage(error) }); }
}

export async function executeDemo(command: DemoCommand, operationId = crypto.randomUUID(), context?: { actorId: string; generation: string }) {
  if (!snapshot.state || !snapshot.actorId) throw new Error("Выберите демо-профиль.");
  if (context && (context.actorId !== snapshot.actorId || context.generation !== snapshot.state.generation)) throw new Error("Демо-профиль или данные изменились. Повторите действие.");
  const envelope = { command, operationId, actorId: snapshot.actorId, generation: snapshot.state.generation };
  const epoch = storageEpoch;
  const result = snapshot.mode === "memory"
    ? applyCommand(snapshot.state, envelope)
    : await repository!.execute(envelope);
  if (epoch === storageEpoch) publish(result);
  return result;
}

export async function resetDemo() {
  const epoch = storageEpoch;
  try {
    const state = snapshot.mode === "memory" ? createDemoState() : await (repository ??= new DemoRepository()).reset();
    if (epoch === storageEpoch) publish(state);
  } catch (error) { if (epoch === storageEpoch) emit({ ...snapshot, error: errorMessage(error) }); }
}

/** Explicit temporary mode never overwrites an existing persistent world. */
export function continueInMemory() {
  storageEpoch++;
  emit({ state: createDemoState(), actorId: null, mode: "memory", error: null });
}
