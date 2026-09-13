import { describe, expect, it } from "vitest";

import { contactLinks } from "./contacts";

const contacts = {
  email: "info@stroygrad.mybuild.test",
  phone: "+994 50 000-00-00",
};

describe("contactLinks", () => {
  it("даёт почту и телефон ссылками", () => {
    expect(contactLinks(contacts)).toEqual([
      {
        label: "Email",
        value: "info@stroygrad.mybuild.test",
        href: "mailto:info@stroygrad.mybuild.test",
      },
      { label: "Телефон", value: "+994 50 000-00-00", href: "tel:+994500000000" },
    ]);
  });

  it("в `tel:` уходят только «+» и цифры, показывается — исходный номер", () => {
    const [, phone] = contactLinks({ ...contacts, phone: "8 (900) 000-00-00" });

    expect(phone).toEqual({
      label: "Телефон",
      value: "8 (900) 000-00-00",
      href: "tel:89000000000",
    });
  });

  it("номер без цифр показывается текстом: звонить некуда", () => {
    const [, phone] = contactLinks({ ...contacts, phone: "—" });

    expect(phone?.href).toBeNull();
  });
});
