"use client";

import { WifiOff } from "lucide-react";

import { useRealtimeOnline } from "@/lib/use-realtime";

/**
 * Признак потери связи с сервером (ТЗ §8).
 *
 * Обновления приходят сами, и молчание экрана двусмысленно: то ли ничего
 * не произошло, то ли сокет оборвался и события больше не доезжают. Отличить
 * одно от другого пользователь может только по этой отметке.
 *
 * Это именно отметка, а не предупреждение об ошибке: связь восстанавливается
 * сама (`RealtimeProvider` переподключается, `bindRefresh` перечитывает
 * пропущенное), а данные на экране никуда не делись — они просто перестали
 * освежаться. Отсюда и спокойный вид, и пауза перед появлением: короткий
 * разрыв при смене сети мигал бы надписью на ровном месте.
 */
export function ConnectionStatus() {
  const online = useRealtimeOnline();

  if (online) return null;

  return (
    <span
      role="status"
      className="border-border text-muted-foreground flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs"
      title="Обновления не приходят. Данные на экране могли устареть — они освежатся, как только связь восстановится"
    >
      <WifiOff className="size-3.5 shrink-0" aria-hidden />
      {/* На узком экране остаётся один значок, но текст читалке нужен всегда. */}
      <span className="sr-only sm:not-sr-only">Нет связи</span>
    </span>
  );
}
