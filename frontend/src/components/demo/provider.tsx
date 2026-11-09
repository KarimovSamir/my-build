"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { initializeDemo, reloadDemo, subscribeDemo, getDemoSnapshot, getServerDemoSnapshot, resetDemo, continueInMemory } from "@/lib/demo/store";

export function useDemo() { return useSyncExternalStore(subscribeDemo, getDemoSnapshot, getServerDemoSnapshot); }

export function DemoProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void initializeDemo();
    const refresh = () => { if (document.visibilityState === "visible") void reloadDemo(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  return children;
}

export function DemoGate({ children }: { children: ReactNode }) {
  const { state, error, mode } = useDemo();
  if (error) return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-6" role="alert">
      <h1 className="font-heading text-2xl">Не удалось открыть демо</h1>
      <p>{error}</p>
      <Button onClick={() => void reloadDemo()}>Повторить</Button>
      <Button variant="outline" onClick={() => { if (window.confirm("Удалить локальные изменения и начать заново?")) void resetDemo(); }}>Начать заново</Button>
      <Button variant="outline" onClick={continueInMemory}>Продолжить без сохранения</Button>
      <p className="text-muted-foreground text-sm">Без сохранения изменения пропадут после обновления страницы. Существующие данные браузера не удаляются.</p>
    </div>
  );
  if (!state) return <p className="p-6" role="status">Открываем демо…</p>;
  return <>{mode === "memory" && <p role="status" className="bg-accent p-3 text-center text-sm">Изменения хранятся только до обновления этой страницы.</p>}{children}</>;
}
