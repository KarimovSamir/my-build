import { ChevronDown } from "lucide-react";

import { FileRow } from "@/components/file-row";
import { DownloadFileButton } from "@/components/orders/download-file-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { pluralRu } from "@/lib/plural";
import type { SubmissionsView, SubmissionView } from "@/lib/submissions";

const ROUND_FORMS = ["раунд", "раунда", "раундов"] as const;

/**
 * Сдачи работы (ТЗ §4.1).
 *
 * По умолчанию видна последняя сдача, предыдущие — в сворачиваемом блоке
 * «История сдач»: файлы компании версионируются, а не заменяются, и в споре
 * «сдал → вернули → пересдал» нужны именно прежние.
 *
 * Блок видят только стороны сделки — посторонней компании файлы не приходят
 * вовсе (ТЗ §4.1, приватность), и решает это backend, а не разметка.
 *
 * `<details>`, а не состояние React: раскрытие истории — чистое поведение
 * браузера, и ради него незачем делать серверный компонент клиентским.
 */
export function SubmissionsCard({
  submissions,
  isOwner,
}: {
  submissions: SubmissionsView;
  /** Клиенту и исполнителю пустой список объясняется по-разному. */
  isOwner: boolean;
}) {
  const { latest, history } = submissions;

  // Число рядом с заголовком — сколько сдач всего, а не номер последней:
  // ровно то же значение, что и у «Истории сдач» ниже. Номера сдач и их
  // количество расходятся, как только раунд остаётся без файлов.
  const total = history.length + (latest ? 1 : 0);

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <CardTitle>Сдачи работ</CardTitle>
        {total > 0 ? (
          <span className="text-muted-foreground text-sm">
            {total} {pluralRu(total, ROUND_FORMS)}
          </span>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {latest ? (
          <Submission submission={latest} isOwner={isOwner} />
        ) : (
          <p className="text-muted-foreground text-sm">
            {isOwner
              ? "Исполнитель ещё не загружал файлы работы."
              : "Вы ещё не загружали файлы работы по этому заказу."}
          </p>
        )}

        {history.length > 0 ? (
          <details className="group border-border border-t pt-4">
            <summary className="text-muted-foreground hover:text-foreground flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium">
              <ChevronDown
                className="size-4 transition-transform group-open:rotate-180"
                aria-hidden
              />
              История сдач · {history.length}
            </summary>

            <div className="mt-4 flex flex-col gap-4">
              {history.map((submission) => (
                <Submission
                  key={submission.round}
                  submission={submission}
                  isOwner={isOwner}
                />
              ))}
            </div>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Одна сдача: номер, состояние, комментарий компании и её файлы.
 *
 * Незакрытая сдача видна обеим сторонам — файлы попадают в заказ сразу, а
 * «Сдать работу» лишь закрывает раунд. Пишется это каждой стороне своими
 * словами: клиенту важно, что исполнитель ещё не закончил, компании — что
 * клиент эти файлы уже видит.
 */
function Submission({
  submission,
  isOwner,
}: {
  submission: SubmissionView;
  isOwner: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-xl border">
      {/* Шапка раунда на подложке — та же, что у шапки таблицы: номер сдачи
          отделён от её содержимого. */}
      <div className="bg-brand-surface flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b px-4 py-3.5">
        <h3 className="flex items-center gap-3">
          <span
            className="bg-accent text-primary flex size-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs"
            aria-hidden
          >
            {submission.round}
          </span>
          <span className="font-heading text-base font-semibold">
            Сдача №{submission.round}
          </span>
        </h3>
        <p className="text-muted-foreground font-mono text-xs">
          {submission.submittedAt
            ? `сдана ${formatDate(submission.submittedAt)}`
            : isOwner
              ? "исполнитель ещё готовит эту сдачу"
              : "готовится — вы ещё не сдали её клиенту"}
        </p>
      </div>

      {submission.comment ? (
        <p className="text-secondary-foreground border-b px-4 py-3.5 text-sm leading-relaxed whitespace-pre-line">
          {submission.comment}
        </p>
      ) : null}

      {submission.files.length > 0 ? (
        <ul className="divide-border divide-y">
          {submission.files.map((file) => (
            <FileRow key={file.id} file={file}>
              <DownloadFileButton fileId={file.id} fileName={file.originalName} />
            </FileRow>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground px-4 py-3.5 text-sm">
          Файлов в этой сдаче нет.
        </p>
      )}
    </section>
  );
}
