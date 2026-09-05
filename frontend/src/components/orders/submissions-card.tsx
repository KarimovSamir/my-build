import { ChevronDown, FileText, Image as ImageIcon } from "lucide-react";

import type { OrderFileDto } from "@/lib/types";

import { DownloadFileButton } from "@/components/orders/download-file-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isImageMimeType } from "@/lib/file-kind";
import { formatDate, formatFileSize } from "@/lib/format";
import type { SubmissionsView, SubmissionView } from "@/lib/submissions";

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
      <CardHeader>
        <CardTitle>
          Сдачи работ
          {total > 0 ? (
            <span className="text-muted-foreground font-normal"> · {total}</span>
          ) : null}
        </CardTitle>
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
    <section className="border-border rounded-lg border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-medium">Сдача №{submission.round}</h3>
        <p className="text-muted-foreground text-xs">
          {submission.submittedAt
            ? `Сдана ${formatDate(submission.submittedAt)}`
            : isOwner
              ? "Исполнитель ещё готовит эту сдачу"
              : "Готовится — вы ещё не сдали её клиенту"}
        </p>
      </div>

      {submission.comment ? (
        <p className="mt-3 text-sm whitespace-pre-line">{submission.comment}</p>
      ) : null}

      {submission.files.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {submission.files.map((file) => (
            <SubmissionFile key={file.id} file={file} />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground mt-3 text-sm">Файлов в этой сдаче нет.</p>
      )}
    </section>
  );
}

function SubmissionFile({ file }: { file: OrderFileDto }) {
  const Icon = isImageMimeType(file.mimeType) ? ImageIcon : FileText;

  return (
    <li className="border-border flex items-center gap-3 rounded-lg border p-2">
      <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-md">
        <Icon className="text-muted-foreground size-4" aria-hidden />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{file.originalName}</span>
        <span className="text-muted-foreground text-xs">
          {formatFileSize(file.sizeBytes)} · {formatDate(file.createdAt)}
        </span>
      </span>

      <DownloadFileButton fileId={file.id} fileName={file.originalName} />
    </li>
  );
}
