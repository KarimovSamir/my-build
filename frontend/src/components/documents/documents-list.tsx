import { FileText, ImageIcon } from "lucide-react";
import Link from "next/link";

import {
  DEFAULT_PAGE_SIZE,
  formatOrderNumber,
  type DocumentListItem,
  type Paginated,
  type Role,
} from "@/lib/types";

import { EmptyCard, OutOfRange, PaginationBar } from "@/components/list-parts";
import { DownloadFileButton } from "@/components/orders/download-file-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { serverApi } from "@/lib/api.server";
import { documentOwnerLabel } from "@/lib/document-view";
import {
  documentsHref,
  isEmptyDocumentsFilter,
  type DocumentsFilter,
} from "@/lib/documents-filter";
import { isImageMimeType } from "@/lib/file-kind";
import { formatDate, formatFileSize } from "@/lib/format";

/**
 * Все файлы пользователя одним списком (ТЗ §5, §7).
 *
 * Смысл раздела — найти файл, не заходя в заказы, поэтому в строке есть и то,
 * чего нет в карточке заказа: к какому заказу файл относится и кем загружен.
 * Скачивание — тот же `DownloadFileButton`, что и в заказе: подпись живёт
 * пять минут и запрашивается по нажатию.
 */
export async function DocumentsList({
  filter,
  viewer,
}: {
  filter: DocumentsFilter;
  /** Роль смотрящего: от неё зависит, какие файлы называются своими. */
  viewer: Role;
}) {
  const page = await serverApi.get<Paginated<DocumentListItem>>("/documents", {
    query: {
      ownerType: filter.ownerType,
      orderId: filter.orderId,
      page: filter.page,
      // Размер страницы задаётся явно, а не берётся из умолчания backend:
      // иначе смена умолчания на сервере молча меняла бы вид экрана.
      pageSize: DEFAULT_PAGE_SIZE,
    },
  });

  if (page.total === 0) {
    return isEmptyDocumentsFilter(filter) ? (
      <EmptyCard
        title="Документов пока нет"
        description="Здесь появятся файлы по вашим заказам: задание клиента и то, что загрузил исполнитель."
      />
    ) : (
      <EmptyCard
        title="Ничего не найдено"
        description="По этой выборке файлов нет. Попробуйте другой заказ или другую вкладку."
      >
        <Button variant="outline" asChild>
          <Link href={documentsHref()}>Сбросить фильтры</Link>
        </Button>
      </EmptyCard>
    );
  }

  return (
    <Card className="gap-0 p-0">
      {page.items.length === 0 ? (
        <OutOfRange
          href={documentsHref({ ownerType: filter.ownerType, orderId: filter.orderId })}
          label="На этой странице документов нет"
        />
      ) : (
        <ul className="divide-border divide-y">
          {page.items.map((document) => (
            <DocumentRow key={document.id} document={document} viewer={viewer} />
          ))}
        </ul>
      )}

      <PaginationBar
        shown={page.items.length}
        total={page.total}
        page={filter.page}
        totalPages={page.totalPages}
        hrefFor={(next) => documentsHref({ ...filter, page: next })}
      />
    </Card>
  );
}

function DocumentRow({
  document,
  viewer,
}: {
  document: DocumentListItem;
  viewer: Role;
}) {
  const Icon = isImageMimeType(document.mimeType) ? ImageIcon : FileText;

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4">
      <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-md">
        <Icon className="text-muted-foreground size-4" aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{document.originalName}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {formatFileSize(document.sizeBytes)} · {formatDate(document.createdAt)} ·{" "}
          {documentOwnerLabel(document.ownerType, viewer)}
        </p>
      </div>

      {/*
        Ссылка на заказ, а не вся строка ссылкой: рядом стоит кнопка
        скачивания, и вложить её в ссылку нельзя. На узком экране заказ
        уходит на свою строку — иначе название обрывается на полуслове.
      */}
      <Link
        href={`/orders/${document.orderId}`}
        className="hover:text-foreground focus-visible:ring-ring/50 text-muted-foreground order-1 min-w-0 basis-full truncate rounded text-xs underline-offset-4 transition-colors hover:underline focus-visible:ring-3 focus-visible:outline-none sm:order-none sm:basis-auto sm:max-w-3xs"
      >
        {formatOrderNumber(document.orderNumber)} · {document.orderTitle}
      </Link>

      <DownloadFileButton fileId={document.id} fileName={document.originalName} />
    </li>
  );
}
