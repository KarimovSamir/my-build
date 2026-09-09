"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { PROFILE_LIMITS, Role, type UserProfile } from "@/lib/types";

import { Field, FormErrors } from "@/components/form-parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiErrorMessages } from "@/lib/api-errors";
import { browserApi } from "@/lib/api.client";
import {
  isProfileChanged,
  toProfileBody,
  toProfileForm,
  validateProfileForm,
  type ProfileFormErrors,
  type ProfileFormField,
  type ProfileFormValues,
} from "@/lib/profile-form";

/**
 * Профиль пользователя: имя, телефон, город, страна и — у компании — название
 * (ТЗ §7, `PATCH /profile`).
 *
 * Email в форму не входит: его меняет Supabase Auth письмом на новый адрес,
 * а наше API этого поля не принимает вовсе. Роль не меняется никогда —
 * на ней держится вся модель доступа.
 *
 * Ответ маршрута — свежий профиль, им форма и обновляется: считать результат
 * второй раз на фронте незачем. `router.refresh()` следом нужен каркасу —
 * имя в боковом меню и город в шапке приходят из layout'а.
 */
export function ProfileForm({ profile: fromServer }: { profile: UserProfile }) {
  const router = useRouter();
  // Профиль в том виде, в каком он сейчас на сервере: с ним сверяется форма,
  // чтобы кнопка «Сохранить» не предлагала сохранить то же самое.
  const [state, setState] = useState({ saved: fromServer, server: fromServer });
  const [values, setValues] = useState<ProfileFormValues>(() => toProfileForm(fromServer));
  const [errors, setErrors] = useState<ProfileFormErrors>({});
  const [formError, setFormError] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);

  const saved = state.saved;

  // Серверный рендер — источник правды: сравнение по ссылке отличает «пришёл
  // новый профиль» от обычного перерисовывания, и делается это в рендере,
  // а не в эффекте (`CLAUDE.md` §10) — иначе кадр между ними показывал бы
  // устаревшие данные.
  if (state.server !== fromServer) {
    setState({ saved: fromServer, server: fromServer });

    // Начатую правку новый ответ не затирает: человек мог печатать, пока
    // каркас перечитывал профиль.
    if (!isProfileChanged(values, saved)) setValues(toProfileForm(fromServer));
  }

  const changed = isProfileChanged(values, saved);

  function setField(field: ProfileFormField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function handleReset() {
    setValues(toProfileForm(saved));
    setErrors({});
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const found = validateProfileForm(values, saved.role);
    setErrors(found);

    if (Object.values(found).some(Boolean)) {
      setFormError(["Проверьте выделенные поля"]);
      return;
    }

    setPending(true);

    try {
      const updated = await browserApi.patch<UserProfile>(
        "/profile",
        toProfileBody(values, saved.role),
      );

      // Ответ маршрута — уже записанный профиль: форма сходится с ним сразу,
      // не дожидаясь серверного ре-рендера.
      setState((current) => ({ ...current, saved: updated }));
      setValues(toProfileForm(updated));
      toast.success("Профиль сохранён");

      // Каркас кабинета читает профиль сам: без этого имя в меню осталось бы
      // прежним до перезагрузки страницы.
      router.refresh();
    } catch (error) {
      setFormError(
        apiErrorMessages(
          error,
          "Не удалось сохранить профиль. Проверьте соединение и попробуйте ещё раз",
        ),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Профиль</CardTitle>
        <CardDescription>
          {saved.role === Role.COMPANY
            ? "Название компании и контакты видит клиент в каталоге подрядчиков и в предложениях"
            : "Имя и контакты видит компания, с которой вы работаете по заказу"}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          {saved.role === Role.COMPANY ? (
            <Field
              id="companyName"
              name="companyName"
              label="Название компании"
              placeholder="ООО «СтройГрад»"
              hint="Под этим названием вас видят клиенты"
              maxLength={PROFILE_LIMITS.companyName}
              value={values.companyName}
              onChange={(event) => setField("companyName", event.target.value)}
              error={errors.companyName}
              disabled={pending}
              required
            />
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              id="firstName"
              name="firstName"
              label="Имя"
              autoComplete="given-name"
              maxLength={PROFILE_LIMITS.firstName}
              value={values.firstName}
              onChange={(event) => setField("firstName", event.target.value)}
              error={errors.firstName}
              disabled={pending}
              required
            />
            <Field
              id="lastName"
              name="lastName"
              label="Фамилия"
              autoComplete="family-name"
              maxLength={PROFILE_LIMITS.lastName}
              value={values.lastName}
              onChange={(event) => setField("lastName", event.target.value)}
              error={errors.lastName}
              disabled={pending}
            />
          </div>

          <Field
            id="phone"
            name="phone"
            type="tel"
            label="Телефон"
            autoComplete="tel"
            placeholder="+7 900 000-00-00"
            hint="По нему с вами свяжется вторая сторона заказа"
            maxLength={PROFILE_LIMITS.phone}
            value={values.phone}
            onChange={(event) => setField("phone", event.target.value)}
            error={errors.phone}
            disabled={pending}
            required
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              id="city"
              name="city"
              label="Город"
              autoComplete="address-level2"
              maxLength={PROFILE_LIMITS.city}
              value={values.city}
              onChange={(event) => setField("city", event.target.value)}
              error={errors.city}
              disabled={pending}
            />
            <Field
              id="country"
              name="country"
              label="Страна"
              autoComplete="country-name"
              maxLength={PROFILE_LIMITS.country}
              value={values.country}
              onChange={(event) => setField("country", event.target.value)}
              error={errors.country}
              disabled={pending}
            />
          </div>

          {formError ? <FormErrors messages={formError} /> : null}

          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              disabled={pending || !changed}
            >
              Отменить
            </Button>
            <Button type="submit" disabled={pending || !changed}>
              {pending ? "Сохраняем…" : "Сохранить изменения"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
