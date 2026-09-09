import { AtSign, CalendarDays, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { roleLabels, type UserProfile } from "@/lib/types";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";

/**
 * Учётная запись: то, что в настройках показывается, но не меняется.
 *
 * Email меняет Supabase Auth письмом на новый адрес, и в ТЗ §7 этого действия
 * у раздела нет — здесь он только показан, чтобы человек видел, под какой
 * учётной записью вошёл. Роль не меняется никогда: на ней держится вся модель
 * доступа, и смена превратила бы заказы клиента в чужие.
 */
export function AccountCard({ profile }: { profile: UserProfile }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Учётная запись</CardTitle>
        <CardDescription>Эти данные менять нельзя</CardDescription>
      </CardHeader>

      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-3">
          <Row icon={<AtSign className="size-4" aria-hidden />} label="Email">
            {profile.email}
          </Row>
          <Row icon={<ShieldCheck className="size-4" aria-hidden />} label="Роль">
            {roleLabels[profile.role]}
          </Row>
          <Row icon={<CalendarDays className="size-4" aria-hidden />} label="На площадке с">
            {formatDate(profile.createdAt)}
          </Row>
        </dl>
      </CardContent>
    </Card>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}
