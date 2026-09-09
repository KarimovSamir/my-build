import { ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { ContractorCard } from "@/lib/types";

import { PageHeader } from "@/components/page-shell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  completedOrdersText,
  contractorContacts,
  contractorLocation,
} from "@/lib/contractor-view";
import { contractorsHref } from "@/lib/contractors-filter";
import { initialOf } from "@/lib/format";

/**
 * Карточка подрядчика (ТЗ §7): название, город, контакты, число завершённых
 * заказов.
 *
 * Больше показывать нечего и не из чего: рейтингов и отзывов на MVP нет
 * (ТЗ §11), а заказы компании — чужие данные, и в каталог они не попадают.
 * Каталог существует, чтобы связаться с компанией напрямую, поэтому контакты
 * здесь — ссылки, а не текст.
 */
export function ContractorProfile({ contractor }: { contractor: ContractorCard }) {
  const location = contractorLocation(contractor);

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
            <dl className="grid gap-4 sm:grid-cols-2">
              {contractorContacts(contractor).map((contact) => (
                <Field key={contact.label} label={contact.label}>
                  {contact.href ? (
                    <a
                      href={contact.href}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {contact.value}
                    </a>
                  ) : (
                    contact.value
                  )}
                </Field>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Опыт на площадке</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <Avatar className="size-12 shrink-0">
              <AvatarFallback className="bg-primary text-primary-foreground text-lg font-medium">
                {initialOf(contractor.companyName)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0">
              <p className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="text-muted-foreground size-4 shrink-0" aria-hidden />
                {completedOrdersText(contractor.completedOrdersCount)}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Считаются заказы, которые вы или другие клиенты подтвердили как
                выполненные.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}
