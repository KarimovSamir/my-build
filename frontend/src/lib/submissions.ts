/**
 * Сдачи работы: комментарий компании и файлы, которые к ней относятся (ТЗ §4.1).
 *
 * API присылает их двумя списками — `submissions` и `files` — и соединяет их
 * поле `submissionRound`. Собирать эту связь в разметке нельзя: правило «файлы
 * версионируются по сдачам, а не заменяются» проверяется тестом, а не глазами.
 *
 * Модуль чистый: ни React, ни fetch.
 */

import { FileOwnerType, type OrderDetail, type OrderFileDto } from "@/lib/types";

/** Сдача вместе с файлами своего раунда. */
export interface SubmissionView {
  /** Номер сдачи, начиная с 1. */
  round: number;
  /** Комментарий компании. Пустой — только у файлов без строки сдачи. */
  comment: string;
  /** Когда работа ушла клиенту. `null` — сдача ещё готовится. */
  submittedAt: string | null;
  files: OrderFileDto[];
}

export interface SubmissionsView {
  /** Последняя сдача — та, что показывается развёрнутой (ТЗ §4.1). */
  latest: SubmissionView | null;
  /** Предыдущие сдачи, от свежей к старой: блок «История сдач». */
  history: SubmissionView[];
  /**
   * Сдача, которую компания ещё не отправила клиенту. Их не может быть двух:
   * закрывает сдачу только переход «работа сдана».
   */
  open: SubmissionView | null;
}

const EMPTY: SubmissionsView = { latest: null, history: [], open: null };

/**
 * Сдачи заказа, от первой к последней.
 *
 * Раунды берутся из объединения двух списков, а не из одних `submissions`:
 * файлы компании без строки сдачи в базе возможны (загрузка в хранилище идёт
 * после коммита, и промежуточное состояние существует), а молча потерять
 * файлы страница не вправе.
 */
export function resolveSubmissions(order: OrderDetail): SubmissionsView {
  const filesByRound = new Map<number, OrderFileDto[]>();

  for (const file of order.files) {
    if (file.ownerType !== FileOwnerType.COMPANY) continue;

    const kept = filesByRound.get(file.submissionRound);
    if (kept) kept.push(file);
    else filesByRound.set(file.submissionRound, [file]);
  }

  const rounds = new Set<number>([
    ...order.submissions.map((submission) => submission.round),
    ...filesByRound.keys(),
  ]);

  if (rounds.size === 0) return EMPTY;

  const views = [...rounds]
    .sort((left, right) => left - right)
    .map((round): SubmissionView => {
      const submission = order.submissions.find((item) => item.round === round);

      return {
        round,
        comment: submission?.comment ?? "",
        submittedAt: submission?.submittedAt ?? null,
        files: filesByRound.get(round) ?? [],
      };
    });

  const latest = views.at(-1) ?? null;

  return {
    latest,
    // От свежей к старой: последняя из предыдущих ближе по смыслу к тому,
    // что открыто сверху.
    history: views.slice(0, -1).reverse(),
    open: latest && latest.submittedAt === null ? latest : null,
  };
}
