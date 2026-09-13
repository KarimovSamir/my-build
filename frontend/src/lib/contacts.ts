/**
 * Почта и телефон в виде, пригодном для показа (ТЗ §7).
 *
 * Общий модуль, а не часть каталога: контакты показываются в двух местах —
 * карточка подрядчика и заказчик на карточке заказа, — и нормализация номера
 * для `tel:` у них обязана быть одна. Вторая её копия разошлась бы молча:
 * на экране ссылки выглядят одинаково.
 *
 * Модуль чистый: ни React, ни fetch.
 */

export interface ContactLink {
  label: string;
  /** Что показываем: адрес и номер в том виде, в каком их указал пользователь. */
  value: string;
  /** Куда ведёт ссылка. `null` — показать текстом: звонить или писать некуда. */
  href: string | null;
}

/** Кому принадлежат контакты — в объёме, который для этого нужен. */
export interface Contactable {
  email: string;
  phone: string;
}

/**
 * Контакты со ссылками.
 *
 * Связаться напрямую — единственный способ договориться по заказу, пока чата
 * нет (ТЗ §11), поэтому почта и телефон должны нажиматься, а не выделяться
 * мышью.
 */
export function contactLinks({ email, phone }: Contactable): ContactLink[] {
  return [
    { label: "Email", value: email, href: email ? `mailto:${email}` : null },
    { label: "Телефон", value: phone, href: telHref(phone) },
  ];
}

/**
 * Номер для `tel:` — только `+` и цифры.
 *
 * В базе телефон лежит как есть, вместе с пробелами, скобками и дефисами
 * (`PHONE_PATTERN`), а часть телефонных приложений на таком номере спотыкается.
 */
function telHref(phone: string): string | null {
  const digits = phone.replaceAll(/\D/g, "");

  if (digits === "") return null;

  return `tel:${phone.trimStart().startsWith("+") ? "+" : ""}${digits}`;
}
