import { describe, expect, it } from "vitest";

import { PROFILE_LIMITS, Role, type UserProfile } from "@/lib/types";

import {
  isProfileChanged,
  toProfileBody,
  toProfileForm,
  validateProfileForm,
  type ProfileFormValues,
} from "./profile-form";

/**
 * Форма профиля — зеркало `UpdateProfileDto`: то, что она пропускает, обязано
 * приниматься `PATCH /profile`, а то, что она отклоняет, — отклоняться и там.
 */

const clientProfile: UserProfile = {
  id: "6f1c7a0e-0000-4000-8000-000000000001",
  email: "anna.client@mybuild.test",
  role: Role.CLIENT,
  firstName: "Анна",
  lastName: "Клиентова",
  phone: "+7 900 000-00-00",
  companyName: null,
  city: "Москва",
  country: "Россия",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const companyProfile: UserProfile = {
  ...clientProfile,
  role: Role.COMPANY,
  companyName: "ООО «СтройГрад»",
};

function values(overrides: Partial<ProfileFormValues> = {}): ProfileFormValues {
  return { ...toProfileForm(clientProfile), ...overrides };
}

describe("toProfileForm", () => {
  it("незаполненные поля профиля становятся пустыми строками", () => {
    expect(
      toProfileForm({
        ...clientProfile,
        lastName: null,
        city: null,
        country: null,
      }),
    ).toEqual({
      firstName: "Анна",
      lastName: "",
      phone: "+7 900 000-00-00",
      city: "",
      country: "",
      companyName: "",
    });
  });
});

describe("validateProfileForm", () => {
  it("заполненная форма проходит", () => {
    expect(validateProfileForm(values(), Role.CLIENT)).toEqual({});
  });

  it("имя и телефон обязательны", () => {
    const errors = validateProfileForm(
      values({ firstName: "   ", phone: "" }),
      Role.CLIENT,
    );

    expect(errors.firstName).toBe("Укажите имя");
    expect(errors.phone).toBe("Укажите телефон");
  });

  it("телефон проверяется тем же правилом, что и при регистрации", () => {
    expect(validateProfileForm(values({ phone: "12345" }), Role.CLIENT).phone).toContain(
      "Телефон указан неверно",
    );
  });

  it("фамилия, город и страна могут быть пустыми — это «очистить»", () => {
    expect(
      validateProfileForm(values({ lastName: "", city: "", country: "" }), Role.CLIENT),
    ).toEqual({});
  });

  it("длина полей ограничена пределами из shared", () => {
    const long = "я".repeat(PROFILE_LIMITS.city + 1);
    const errors = validateProfileForm(values({ city: long, country: long }), Role.CLIENT);

    expect(errors.city).toBe(`Город — не более ${PROFILE_LIMITS.city} символов`);
    expect(errors.country).toBe(`Страна — не более ${PROFILE_LIMITS.country} символов`);
  });

  it("у компании название обязательно, у клиента не спрашивается вовсе", () => {
    expect(
      validateProfileForm(values({ companyName: "" }), Role.COMPANY).companyName,
    ).toBe("Укажите название компании");

    expect(
      validateProfileForm(values({ companyName: "" }), Role.CLIENT).companyName,
    ).toBeUndefined();
  });
});

describe("toProfileBody", () => {
  it("обрезает пробелы, пустые необязательные поля отправляет как «очистить»", () => {
    expect(
      toProfileBody(values({ firstName: " Анна ", lastName: "", city: "  " }), Role.CLIENT),
    ).toEqual({
      firstName: "Анна",
      lastName: "",
      phone: "+7 900 000-00-00",
      city: "",
      country: "Россия",
    });
  });

  it("название компании уходит только у роли COMPANY", () => {
    const body = toProfileBody(values({ companyName: " ООО «СтройГрад» " }), Role.COMPANY);

    expect(body.companyName).toBe("ООО «СтройГрад»");
    // У клиента поля в теле нет вовсе: `PATCH /profile` ответил бы на него 400.
    expect("companyName" in toProfileBody(values(), Role.CLIENT)).toBe(false);
  });
});

describe("isProfileChanged", () => {
  it("нетронутая форма изменением не считается", () => {
    expect(isProfileChanged(toProfileForm(clientProfile), clientProfile)).toBe(false);
    expect(isProfileChanged(toProfileForm(companyProfile), companyProfile)).toBe(false);
  });

  it("лишние пробелы по краям — не изменение: в теле запроса их всё равно нет", () => {
    expect(isProfileChanged(values({ firstName: " Анна " }), clientProfile)).toBe(false);
  });

  it("любое изменённое поле включает кнопку", () => {
    expect(isProfileChanged(values({ city: "Казань" }), clientProfile)).toBe(true);
    // Очистка необязательного поля — тоже изменение.
    expect(isProfileChanged(values({ lastName: "" }), clientProfile)).toBe(true);
    expect(
      isProfileChanged(
        { ...toProfileForm(companyProfile), companyName: "ООО «Ремонт Плюс»" },
        companyProfile,
      ),
    ).toBe(true);
  });
});
