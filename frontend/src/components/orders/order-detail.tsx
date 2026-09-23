import { Mail, Phone } from "lucide-react";
import type { ReactNode } from "react";

import {
  MAX_ORDER_FILES_BYTES,
  canDeleteOrder,
  formatOrderNumber,
  objectTypeLabels,
  orderCategoryLabels,
  type OrderDetail,
} from "@/lib/types";

import { FileList, FileRow } from "@/components/file-row";
import { CompanyOfferCard, SubmitOfferCard } from "@/components/orders/company-offer-card";
import { CompletionCard } from "@/components/orders/completion-card";
import { DeleteOrderDialog } from "@/components/orders/delete-order-dialog";
import { DownloadFileButton } from "@/components/orders/download-file-button";
import { OrderOffersCard } from "@/components/orders/order-offers";
import { SubmissionsCard } from "@/components/orders/submissions-card";
import { WorkCard } from "@/components/orders/work-card";
import { PageHeader } from "@/components/page-shell";
import { OrderStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatArea, formatDate, formatFileSize, formatMoney, personInitial } from "@/lib/format";
import {
  emptyClientFilesMessage,
  resolveOrderClient,
  resolveOrderDetailAccess,
  type OrderClientCard,
  type OrderDetailAccess,
} from "@/lib/order-access";
import { resolveClientActions, resolveCompanyActions } from "@/lib/order-actions";
import { resolveOrderNow } from "@/lib/order-now";
import { resolveSubmissions } from "@/lib/submissions";
import { cn } from "@/lib/utils";

/**
 * Карточка заказа (ТЗ §7, «Детали заказа»).
 *
 * Страница одна на обе роли — состав данных урезает backend (ТЗ §4.1), а не
 * этот компонент: компания, не участвующая в заказе, просто получит заказ без
 * файлов, цены и срока. Здесь решается только одно ролевое: удалять заказ
 * может лишь его клиент.
 *
 * Слева — само задание и работа по нему, справа — «Что сейчас»: статус словами
 * и объяснение, чьего действия ждут. Предложения, приёмка и сдачи работы —
 * здесь же. Состав кнопок считают `resolveClientActions` и
 * `resolveCompanyActions` по общей таблице переходов, а не условия по статусу,
 * написанные в разметке.
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
  const actions = resolveClientActions(order, access);
  const submissions = resolveSubmissions(order);
  const company = resolveCompanyActions(order, access, submissions, viewerId);
  const orderLabel = formatOrderNumber(order.orderNumber);
  // `null` у всех, кроме исполнителя: заказчик с контактами нужен тому, кому
  // с ним договариваться.
  const client = resolveOrderClient(order, access);

  // Компании без активного предложения статус заказа приходит замаскированным
  // под «Поиск исполнителя» (ТЗ §4.1) — ни badge, ни «Что сейчас» ей не
  // показываются, и боковой колонки у неё не остаётся вовсе: задание занимает
  // всю ширину. Отдельной проверки на «Заказчика» здесь нет — исполнитель
  // всегда видит и настоящий статус (`ACTIVE_OFFER_STATUSES`).
  const hasAside = access.seesRealStatus;

  return (
    <>
      <PageHeader
        title={order.title}
        badge={access.seesRealStatus ? <OrderStatusBadge status={order.status} /> : null}
        description={
          <span className="font-mono text-xs">
            {orderLabel} · создан {formatDate(order.createdAt)} ·{" "}
            {objectTypeLabels[order.objectType]}
          </span>
        }
        action={
          access.isOwner && canDeleteOrder(order.status) ? (
            <DeleteOrderDialog orderId={order.id} orderLabel={orderLabel} />
          ) : null
        }
      />

      <div className={cn("grid items-start gap-6", hasAside && "lg:grid-cols-3")}>
        <div className={cn("flex min-w-0 flex-col gap-6", hasAside && "lg:col-span-2")}>
          <TaskCard order={order} />

          <ClientFilesCard access={access} filesSizeBytes={order.filesSizeBytes} />

          {access.isOwner ? <OrderOffersCard orderId={order.id} actions={actions} /> : null}

          {/* Компания видит здесь только своё предложение, а если его нет —
              форму отправки, но лишь пока заказ действительно принимает
              предложения (`canSubmitOffer` считает backend, ТЗ §4.1). */}
          {company.ownOffer ? (
            <CompanyOfferCard
              order={order}
              offer={company.ownOffer}
              isExecutor={company.isExecutor}
              canSubmitOffer={company.canSubmitOffer}
            />
          ) : company.canSubmitOffer ? (
            <SubmitOfferCard order={order} />
          ) : null}

          <WorkCard order={order} actions={company} submissions={submissions} />

          {access.isParty ? (
            <>
              <CompletionCard order={order} actions={actions} isOwner={access.isOwner} />

              <SubmissionsCard submissions={submissions} isOwner={access.isOwner} />
            </>
          ) : null}
        </div>

        {/* На узком экране колонки встают друг под друга, и «Что сейчас»
            оказалось бы в самом низу — под всеми сдачами. Поэтому на мобильном
            боковая колонка идёт первой, а на широком возвращается вправо. */}
        {hasAside ? (
          <div className="order-first flex min-w-0 flex-col gap-6 lg:order-none">
            {access.seesRealStatus ? (
              <NowCard order={order} access={access} isExecutor={company.isExecutor} />
            ) : null}

            {client ? <ClientCard client={client} /> : null}

            {company.isExecutor ? <AreaCard order={order} /> : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

/**
 * Задание: то, что описал клиент, и факты объекта одной сеткой.
 *
 * Условия сделки (цена, срок, подрядчик) сюда не попадают намеренно — они
 * живут в «Что сейчас» справа: задание не меняется от того, кто его взял.
 */
function TaskCard({ order }: { order: OrderDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Задание</CardTitle>
      </CardHeader>

      <CardContent>
        <p className="text-secondary-foreground text-[0.9375rem] leading-relaxed whitespace-pre-line">
          {order.description}
        </p>

        {/*
          Сетка фактов: волосяные линии нарисованы промежутками (`gap-px` на
          фоне рамки), поэтому ячейки остаются ячейками и при переносе.
        */}
        <dl className="bg-border mt-6 grid gap-px overflow-hidden rounded-xl border sm:grid-cols-2 lg:grid-cols-3">
          <Fact label="Категория">{orderCategoryLabels[order.category]}</Fact>
          <Fact label="Тип объекта">{objectTypeLabels[order.objectType]}</Fact>
          <Fact label="Площадь">
            <Area order={order} />
          </Fact>
          <Fact label="Адрес объекта">{order.address}</Fact>
          <Fact label="Бюджет клиента" mono>
            {order.clientBudget ? formatMoney(order.clientBudget) : <Empty>Не указан</Empty>}
          </Fact>
          <Fact label="Желаемое начало" mono>
            {order.desiredStartDate ? (
              formatDate(order.desiredStartDate)
            ) : (
              <Empty>Не указано</Empty>
            )}
          </Fact>
        </dl>
      </CardContent>
    </Card>
  );
}

/**
 * «Что сейчас»: статус словами и что он означает для смотрящего.
 *
 * Тёмная панель — то же, что чернильная полоса лендинга и боковое меню: это
 * состояние заказа, а не ещё одна карточка со свойствами. Под ней — условия
 * сделки: до выбора исполнителя их попросту нет, и так и написано.
 */
function NowCard({
  order,
  access,
  isExecutor,
}: {
  order: OrderDetail;
  access: OrderDetailAccess;
  isExecutor: boolean;
}) {
  const now = resolveOrderNow(order.status, { isOwner: access.isOwner, isExecutor });

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="bg-brand-ink text-brand-ink-foreground px-6 py-6">
        <p className="text-brand-ink-accent font-mono text-[0.6875rem] tracking-[0.12em] uppercase">
          Что сейчас
        </p>
        <p className="font-heading mt-2.5 text-[1.375rem] leading-snug font-semibold">
          {now.title}
        </p>
        <p className="text-brand-ink-muted mt-3 text-sm leading-relaxed">{now.text}</p>
      </div>

      {/*
        Условия сделки появляются вместе с ней: до выбора исполнителя цены,
        срока и подрядчика не существует, и три строки «ещё не определено»
        сказали бы ровно то же, что уже сказано выше. Бюджет клиента сюда
        не попадает — ТЗ §3 запрещает смешивать его с ценой сделки, и он
        остался в задании.
      */}
      {order.price ? (
        <dl className="divide-border divide-y">
          <DealRow label="Цена сделки">
            <span className="font-mono font-medium">{formatMoney(order.price)}</span>
          </DealRow>
          <DealRow label="Срок сдачи">
            {order.deadline ? (
              <span className="font-mono">{formatDate(order.deadline)}</span>
            ) : (
              <Empty>Ещё не определён</Empty>
            )}
          </DealRow>
          <DealRow label="Подрядчик">
            {order.contractorName ?? <Empty>Не назначен</Empty>}
          </DealRow>
        </dl>
      ) : null}
    </Card>
  );
}

function DealRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-6 py-3.5">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="min-w-0 text-right text-[0.9375rem] break-words">{children}</dd>
    </div>
  );
}

/**
 * Заказчик: имя, город и контакты (ТЗ §4.1, §7).
 *
 * Показывается только компании-исполнителю — кому именно, решает
 * `resolveOrderClient`. Контакты ссылками, а не текстом: пока чата нет
 * (ТЗ §11), это единственный способ договориться по объекту.
 */
function ClientCard({ client }: { client: OrderClientCard }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-1">
        <p className="text-primary font-mono text-[0.6875rem] tracking-[0.12em] uppercase">
          Заказчик
        </p>

        <div className="flex items-center gap-3.5">
          <span
            className="bg-secondary text-secondary-foreground font-heading flex size-11 shrink-0 items-center justify-center rounded-full text-lg font-semibold"
            aria-hidden
          >
            {personInitial(client.name)}
          </span>
          <div className="min-w-0">
            <p className="font-heading truncate text-[1.0625rem] font-semibold">
              {client.name}
            </p>
            <p className="text-muted-foreground mt-0.5 truncate text-sm">
              {client.location ?? "Город не указан"}
            </p>
          </div>
        </div>

        <ul className="flex flex-col gap-2.5">
          {client.contacts.map((contact) => {
            const Icon = contact.label === "Телефон" ? Phone : Mail;

            return (
              <li key={contact.label} className="flex min-w-0 items-center gap-2.5">
                <Icon className="text-primary size-4 shrink-0" aria-hidden />
                {contact.href ? (
                  <a
                    href={contact.href}
                    className="text-primary min-w-0 font-mono text-sm break-all underline-offset-4 hover:underline"
                  >
                    {contact.value}
                  </a>
                ) : (
                  // Контакт переносится, а не обрезается: наполовину видный
                  // адрес не прочитать и не переписать.
                  <span className="min-w-0 font-mono text-sm break-all">{contact.value}</span>
                )}
              </li>
            );
          })}
        </ul>

        <p className="text-muted-foreground text-xs leading-relaxed">
          Контакты открылись, потому что ваше предложение принято.
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Площадь по факту — врезка исполнителя.
 *
 * Уточнение площади делается кнопкой в блоке «Ваша работа по заказу»; здесь
 * только видно, чьё число сейчас в заказе: своё после замера или клиентское
 * из задания.
 */
function AreaCard({ order }: { order: OrderDetail }) {
  const verified = order.verifiedSquareMeters;

  return (
    <div className="bg-brand-surface rounded-xl border px-5 py-5">
      <p className="text-primary font-mono text-[0.6875rem] tracking-[0.12em] uppercase">
        Площадь по факту
      </p>

      <p className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="font-mono text-xl font-medium">
          {formatArea(verified ?? order.squareMeters)}
        </span>
        <span className="text-muted-foreground text-sm">
          {verified === null ? "как в задании" : "уточнено вами"}
        </span>
      </p>

      <p className="text-secondary-foreground mt-2.5 text-sm leading-relaxed">
        {verified === null
          ? "Если после замера площадь другая — уточните её, клиент увидит новое значение в заказе."
          : `В задании клиента — ${formatArea(order.squareMeters)}. Исходное значение остаётся в заказе.`}
      </p>
    </div>
  );
}

/** Файлы задания. Их видят только стороны сделки — остальным API их не отдаёт. */
function ClientFilesCard({
  access,
  filesSizeBytes,
}: {
  access: OrderDetailAccess;
  /** Объём всех файлов заказа. `null` — смотрящий не сторона сделки. */
  filesSizeBytes: number | null;
}) {
  const files = access.clientFiles;

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <CardTitle>Файлы задания</CardTitle>
        {/*
          Счёт идёт по всему заказу, а не по этой карточке: потолок общий
          на задание клиента и сдачи исполнителя, и в подписи это сказано
          прямо, чтобы число не читалось как «столько весит список выше».
        */}
        {filesSizeBytes === null ? null : (
          <span className="text-muted-foreground font-mono text-xs">
            по заказу занято {formatFileSize(filesSizeBytes)} из{" "}
            {formatFileSize(MAX_ORDER_FILES_BYTES)}
          </span>
        )}
      </CardHeader>

      <CardContent>
        {files.length === 0 ? (
          <p className="text-muted-foreground text-sm">{emptyClientFilesMessage(access)}</p>
        ) : (
          <FileList>
            {files.map((file) => (
              <FileRow key={file.id} file={file}>
                <DownloadFileButton fileId={file.id} fileName={file.originalName} />
              </FileRow>
            ))}
          </FileList>
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
    <span className="flex flex-col">
      <span>{formatArea(order.verifiedSquareMeters)}</span>
      <span className="text-muted-foreground text-xs font-normal">
        уточнено исполнителем, в задании {formatArea(order.squareMeters)}
      </span>
    </span>
  );
}

/** Ячейка сетки фактов: подпись капителью, значение под ней. */
function Fact({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: ReactNode;
  /** Числа и даты набираются моноширинным, как и везде в кабинете. */
  mono?: boolean;
}) {
  return (
    <div className="bg-card min-w-0 px-4 py-3.5">
      <dt className="text-muted-foreground font-mono text-[0.6875rem] tracking-[0.12em] uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1.5 text-[0.9375rem] font-semibold break-words",
          mono && "font-mono font-medium",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground font-sans font-normal">{children}</span>;
}
