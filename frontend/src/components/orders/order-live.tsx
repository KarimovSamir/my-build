"use client";
import type { OrderDetail } from "@/lib/types";
import { OrderDetailView } from "./order-detail";
import { reloadDemo } from "@/lib/demo/store";
/** Committed local snapshots drive the list and the detail view. */
export function OrderLive({ order, viewerId }: { order: OrderDetail; viewerId: string | null }) {
  return <OrderDetailView order={order} viewerId={viewerId} />;
}
export interface OrderSync { apply: (order: OrderDetail) => void; reload: () => void }
const sync: OrderSync = { apply: () => { void reloadDemo(); }, reload: () => { void reloadDemo(); } };
export function useOrderSync(): OrderSync { return sync; }
