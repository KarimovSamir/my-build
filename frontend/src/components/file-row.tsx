import { FileText, Image as ImageIcon } from "lucide-react";
import type { ReactNode } from "react";

import { fileKindLabel, isImageMimeType } from "@/lib/file-kind";
import { formatDate, formatFileSize } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Файл в списке: значок, имя, свойства и действия справа.
 *
 * Один компонент на все три места, где файлы показываются, — задание клиента
 * и сдачи на карточке заказа и раздел «Документы». Раньше это были три копии
 * одной разметки, и расходились они молча: на экране строки выглядят похоже,
 * пока не сравнишь их рядом.
 *
 * Свойства набраны моноширинным и начинаются с типа словом (ТЗ §7): иконка
 * различает только картинку и документ, а PDF, DWG и DXF в ней одинаковы.
 */

/** Файл в объёме, который нужен строке. */
export interface FileRowItem {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export function FileRow({
  file,
  extra,
  children,
  className,
}: {
  file: FileRowItem;
  /** Что дописать к свойствам файла: чей он, к какому заказу относится. */
  extra?: string;
  /** Действия справа: скачивание, ссылка на заказ. */
  children?: ReactNode;
  className?: string;
}) {
  const Icon = isImageMimeType(file.mimeType) ? ImageIcon : FileText;

  return (
    <li
      className={cn(
        "hover:bg-brand-surface flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 transition-colors",
        className,
      )}
    >
      <span className="bg-accent text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
        <Icon className="size-[1.0625rem]" aria-hidden />
      </span>

      <span className="min-w-0 flex-1">
        {/* Имя переносится, а не обрезается: на узком экране от «Схема
            разводки.pdf» оставалось «Схема разводки…», то есть пропадало
            расширение — единственное, чем файлы в списке и различаются. */}
        <span className="block text-[0.9375rem] font-semibold break-words">
          {file.originalName}
        </span>
        {/* Без `truncate`: на узком экране строка обязана переноситься, иначе
            от неё остаётся тип с половиной размера. */}
        <span className="text-muted-foreground mt-0.5 block font-mono text-xs">
          {fileKindLabel(file.mimeType)} · {formatFileSize(file.sizeBytes)} ·{" "}
          {formatDate(file.createdAt)}
          {extra ? ` · ${extra}` : ""}
        </span>
      </span>

      {children}
    </li>
  );
}

/** Рамка вокруг списка файлов: строки внутри разделены волосяной линией. */
export function FileList({ children }: { children: ReactNode }) {
  return <ul className="divide-border divide-y overflow-hidden rounded-xl border">{children}</ul>;
}
