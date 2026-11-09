import type { Prisma } from '../../generated/prisma/client.js';
export { orderRef, notificationKeys, type OrderRef } from '@mybuild/shared';

/** Адресат и ключ будущего уведомления. */
interface CollapsibleDraft {
  userId: string;
  collapseKey?: string | null;
}

/**
 * Убрать непрочитанные уведомления, которые заменят `drafts`.
 *
 * Зовётся той же транзакцией, что и запись новых, под блокировкой заказа:
 * два перехода одного заказа не пересекаются, и повтор не проскочит.
 * Прочитанные остаются — это история, а не очередь.
 */
export async function dropSupersededNotifications(
  tx: Prisma.TransactionClient,
  drafts: CollapsibleDraft[],
): Promise<void> {
  const keyed = drafts.flatMap(({ userId, collapseKey }) =>
    collapseKey ? [{ userId, collapseKey }] : [],
  );

  if (keyed.length === 0) return;

  await tx.notification.deleteMany({ where: { isRead: false, OR: keyed } });
}
