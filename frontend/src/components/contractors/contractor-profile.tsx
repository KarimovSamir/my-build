import { ArrowLeft, Info } from "lucide-react";
import Link from "next/link";

import type { ContractorCard } from "@/lib/types";

import { ListField } from "@/components/list-parts";
import { PageHeader } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { contactLinks } from "@/lib/contacts";
import { completedOrdersText } from "@/lib/contractor-view";
import { contractorsHref } from "@/lib/contractors-filter";
import { formatLocation } from "@/lib/format";

/**
 * Карточка подрядчика (ТЗ §7): название, город, контакты, число завершённых
 * заказов.
 *
 * Больше показывать нечего и не из чего: рейтингов и отзывов на MVP нет
 * (ТЗ §11), а заказы компании — чужие данные, и в каталог они не попадают.
 * Каталог существует, чтобы связаться с компанией напрямую, поэтому контакты
 * здесь — ссылки, а не текст.
 *
 * Собрана по образцу правой колонки карточки заказа: тёмная панель с главным
 * о компании и светлая подсказка под ней. Подписи полей — общий `ListField`,
 * тот же, что в строках списков: на всех экранах кабинета «подпись — значение»
 * выглядит одинаково.
 */
export function ContractorProfile({ contractor }: { contractor: ContractorCard }) {
  const location = formatLocation(contractor);

  return (
    <>
      <PageHeader
        title={contractor.companyName}
        description={location ?? "Город не указан"}
        action={
          <Button variant="outline" asChild>
            <Link href={contractorsHref()}>
              <ArrowLeft className="size-4" aria-hidden />
              К каталогу
            </Link>
          </Button>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Контакты</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-5 sm:grid-cols-2">
              {contactLinks(contractor).map((contact) => (
                <ListField key={contact.label} label={contact.label}>
                  {contact.href ? (
                    <a
                      href={contact.href}
                      className="text-primary font-mono text-[0.9375rem] underline-offset-4 hover:underline"
                    >
                      {contact.value}
                    </a>
                  ) : (
                    <span className="font-mono text-[0.9375rem]">{contact.value}</span>
                  )}
                </ListField>
              ))}
            </dl>
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-6">
          {/*
            Тёмная панель — та же, что «Что сейчас» на карточке заказа: главное
            о компании крупно, объяснение под ним.
          */}
          <Card className="gap-0 overflow-hidden p-0">
            <div className="bg-brand-ink text-brand-ink-foreground px-6 py-6">
              <p className="text-brand-ink-accent font-mono text-[0.6875rem] tracking-[0.12em] uppercase">
                Опыт на площадке
              </p>

              {/* Буквы-аватара здесь нет намеренно: название компании стоит
                  в заголовке экрана, и в узкой колонке кружок отнимал бы
                  ширину у самой длинной строки блока. */}
              <p className="font-heading mt-2.5 text-[1.375rem] leading-snug font-semibold">
                {completedOrdersText(contractor.completedOrdersCount)}
              </p>

              <p className="text-brand-ink-muted mt-3 text-sm leading-relaxed">
                Считаются заказы, которые вы или другие клиенты подтвердили как
                выполненные.
              </p>
            </div>
          </Card>

          <div className="bg-brand-surface rounded-xl border px-5 py-5">
            <p className="font-heading flex items-center gap-2.5 text-base font-semibold">
              <Info className="text-primary size-4.5 shrink-0" aria-hidden />
              Договариваетесь напрямую
            </p>
            <p className="text-secondary-foreground mt-2.5 text-sm leading-relaxed">
              Чата на площадке нет — напишите или позвоните компании сами.
              Предложение по заказу она присылает здесь: адресовать заказ
              конкретной компании нельзя, его видят все.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
