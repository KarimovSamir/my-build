import { ShieldCheck } from "lucide-react";

import { roleLabels, type UserProfile } from "@/lib/types";

import { FormSection } from "@/components/form-parts";
import { ListField } from "@/components/list-parts";
import { formatDate } from "@/lib/format";

/**
 * Учётная запись: то, что в настройках показывается, но не меняется.
 *
 * Email меняет Supabase Auth письмом на новый адрес, и в ТЗ §7 этого действия
 * у раздела нет — здесь он только показан, чтобы человек видел, под какой
 * учётной записью вошёл. Роль не меняется никогда: на ней держится вся модель
 * доступа, и смена превратила бы заказы клиента в чужие.
 *
 * Блок выглядит как остальные блоки настроек, но полей ввода в нём нет:
 * подписи набраны той же моноширинной капителью, что и в карточках кабинета
 * (`ListField`), — так видно, что это показ, а не форма.
 */
export function AccountCard({ profile }: { profile: UserProfile }) {
  return (
    <FormSection
      icon={<ShieldCheck className="size-[1.0625rem]" />}
      title="Учётная запись"
      description="Эти данные менять нельзя"
    >
      <dl className="grid gap-5 sm:grid-cols-3">
        <ListField label="Email">
          <span className="font-mono text-sm break-words">{profile.email}</span>
        </ListField>
        <ListField label="Роль">
          <span className="text-[0.9375rem] font-semibold">{roleLabels[profile.role]}</span>
        </ListField>
        <ListField label="На площадке с">
          <span className="font-mono text-sm">{formatDate(profile.createdAt)}</span>
        </ListField>
      </dl>
    </FormSection>
  );
}
