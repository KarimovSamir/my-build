import { FileText, Image as ImageIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
  canDeleteOrder,
  formatOrderNumber,
  objectTypeLabels,
  orderCategoryLabels,
  type OrderDetail,
} from "@/lib/types";

import { DeleteOrderDialog } from "@/components/orders/delete-order-dialog";
import { DownloadFileButton } from "@/components/orders/download-file-button";
import { ComingSoon, PageHeader } from "@/components/page-shell";
import { OrderStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatArea, formatDate, formatFileSize, formatMoney } from "@/lib/format";
import {
  emptyClientFilesMessage,
  resolveOrderDetailAccess,
  type OrderDetailAccess,
} from "@/lib/order-access";

/**
 * Карточка заказа (ТЗ §7, «Детали заказа»).
 *
 * Страница одна на обе роли — состав данных урезает backend (ТЗ §4.1), а не
 * этот компонент: компания, не участвующая в заказе, просто получит заказ без
 * файлов, цены и срока. Здесь решается только одно ролевое: удалять заказ
 * может лишь его клиент.
 *
 * Предложения и сдачи работ появятся в Фазе 4 — их места размечены заглушками,
 * чтобы страница не перестраивалась заново, когда они приедут.
 */
export function OrderDetailView({
  order,
  viewerId,
}: {
  order: OrderDetail;
  /** Кто смотрит. `null` — сессия пропала между рендером и запросом. */
  viewerId: string | null;
}) {
  // Кто смотрит и что ему видно — в `lib/order-access.ts`: правило приватности
  // проверяется тестом, а не глазами по разметке.
  const access = resolveOrderDetailAccess(order, viewerId);
  const orderLabel = formatOrderNumber(order.orderNumber);

  return (
    <>
      <PageHeader
        title={order.title}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="text-foreground font-medium">{orderLabel}</span>
            <span aria-hidden>·</span>
            <span>Создан {formatDate(order.createdAt)}</span>
            <OrderStatusBadge status={order.status} />
          </span>
        }
        action={
          access.isOwner && canDeleteOrder(order.status) ? (
            <DeleteOrderDialog orderId={order.id} orderLabel={orderLabel} />
          ) : null
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Описание работ</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-line">{order.description}</p>
            </CardContent>
          </Card>

          <ClientFilesCard access={access} />

          <ComingSoon title="Предложения компаний" phase="Фазе 4">
            Цена, срок и комментарий каждой компании — с выбором исполнителя
          </ComingSoon>

          <ComingSoon title="Сдачи работ" phase="Фазе 4">
            Файлы и комментарий последней сдачи, история предыдущих
          </ComingSoon>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Объект</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-4">
                <Row label="Категория">{orderCategoryLabels[order.category]}</Row>
                <Row label="Тип объекта">{objectTypeLabels[order.objectType]}</Row>
                <Row label="Площадь">
                  <Area order={order} />
                </Row>
                <Row label="Адрес">{order.address}</Row>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Бюджет и сроки</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-4">
                {/* `clientBudget` — ожидание клиента, `price` — цена
                    состоявшейся сделки. ТЗ §3 запрещает смешивать их, поэтому
                    это две отдельные строки, а не одна «сумма». */}
                <Row label="Бюджет клиента">
                  {order.clientBudget ? formatMoney(order.clientBudget) : <Empty>Не указан</Empty>}
                </Row>
                <Row label="Цена сделки">
                  {order.price ? formatMoney(order.price) : <Empty>Ещё не определена</Empty>}
                </Row>
                <Row label="Желаемая дата начала">
                  {order.desiredStartDate ? (
                    formatDate(order.desiredStartDate)
                  ) : (
                    <Empty>Не указана</Empty>
                  )}
                </Row>
                <Row label="Срок сдачи">
                  {order.deadline ? formatDate(order.deadline) : <Empty>Ещё не определён</Empty>}
                </Row>
                <Row label="Подрядчик">
                  {order.contractorName ?? <Empty>Не назначен</Empty>}
                </Row>
              </dl>

              {order.price ? null : (
                <p className="text-muted-foreground mt-4 text-xs">
                  Цена сделки, срок и подрядчик появятся, когда будет принято
                  предложение компании.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

/** Файлы задания. Их видят только стороны сделки — остальным API их не отдаёт. */
function ClientFilesCard({ access }: { access: OrderDetailAccess }) {
  const files = access.clientFiles;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Файлы клиента</CardTitle>
      </CardHeader>

      <CardContent>
        {files.length === 0 ? (
          <p className="text-muted-foreground text-sm">{emptyClientFilesMessage(access)}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {files.map((file) => (
              <li
                key={file.id}
                className="border-border flex items-center gap-3 rounded-lg border p-2"
              >
                <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-md">
                  <FileIcon mimeType={file.mimeType} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {file.originalName}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {formatFileSize(file.sizeBytes)} · {formatDate(file.createdAt)}
                  </span>
                </span>

                <DownloadFileButton fileId={file.id} fileName={file.originalName} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Площадь. Если исполнитель её уточнил, показываются оба значения: исходное
 * клиента не перезаписывается (ТЗ §4.1).
 */
function Area({ order }: { order: OrderDetail }) {
  if (order.verifiedSquareMeters === null) {
    return <>{formatArea(order.squareMeters)}</>;
  }

  return (
    <span className="flex flex-col gap-1">
      <span>
        {formatArea(order.verifiedSquareMeters)}
        <span className="text-muted-foreground text-xs"> — уточнено исполнителем</span>
      </span>
      <span className="text-muted-foreground text-xs">
        {formatArea(order.squareMeters)} — указано клиентом
      </span>
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  const Icon = mimeType.startsWith("image/") ? ImageIcon : FileText;

  return <Icon className="text-muted-foreground size-4" aria-hidden />;
}
