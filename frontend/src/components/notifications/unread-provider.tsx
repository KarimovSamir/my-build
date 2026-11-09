"use client";
import { useDemo } from "@/components/demo/provider";
import { reloadDemo } from "@/lib/demo/store";
export interface Unread { count: number | null; refresh: () => void }
export function useUnread(): Unread {
  const { state, actorId } = useDemo();
  return { count: state && actorId ? state.notifications.filter((n) => n.userId === actorId && !n.isRead).length : null,
    refresh: () => { void reloadDemo(); } };
}
