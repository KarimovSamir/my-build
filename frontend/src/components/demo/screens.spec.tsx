import React from "react";
import { renderToString } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
import { createDemoState } from "@/lib/demo/model";
import { DemoContractors, DemoDocuments, DemoNewOrder, DemoNotifications, DemoOrderPage, DemoOrders, DemoSettings } from "./screens";
import { isNavItemActive } from "@/lib/navigation";
import { Role } from "@/lib/types";

const context = vi.hoisted(() => ({ state: null as unknown, actorId: "anna", query: "" }));
vi.mock("./provider", () => ({ useDemo: () => context }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(context.query),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

// React SSR checks data-to-component integration, not browser layout or hydration.
describe("local screens render their real data without server access", () => {
  it("renders every seeded order for all three actors, including documents and work actions", () => {
    context.state = createDemoState();
    for (const actor of ["anna", "stroygrad", "remontplus"]) {
      context.actorId = actor;
      for (let i = 1; i <= 6; i++) {
        context.query = `id=sample-${i}`;
        const html = renderToString(<DemoOrderPage />);
        expect(html).toContain(`ORD-${1000 + i}`);
        if (actor === "remontplus" && i > 2) expect(html).not.toContain("Сдачи работ");
        if (actor === "anna" && i === 4) expect(html).toContain("Подтвердить выполнение");
        if (actor === "stroygrad" && i === 3) expect(html).toContain("Добавить файлы");
      }
    }
  });
  it("renders all lists, forms, filters and missing-entity screens", () => {
    context.state = createDemoState(); context.actorId = "anna"; context.query = "";
    for (const screen of [<DemoOrders key="orders" mode="orders" />, <DemoNewOrder key="new" />, <DemoContractors key="contractors" />, <DemoDocuments key="documents" />, <DemoNotifications key="notifications" />, <DemoSettings key="settings" />]) {
      expect(renderToString(screen).length).toBeGreaterThan(100);
    }
    context.query = "id=stroygrad";
    expect(renderToString(<DemoContractors detail />)).toContain("СтройГрад");
    context.query = "id=missing";
    expect(renderToString(<DemoOrderPage />)).toContain("отсутствует");
    expect(renderToString(<DemoContractors detail />)).toContain("не найдена");
    context.actorId = "stroygrad"; context.query = "";
    expect(renderToString(<DemoOrders mode="offers" />)).toContain("ORD-1003");
    expect(renderToString(<DemoOrders mode="available" />)).toContain("ORD-1001");
    expect(renderToString(<DemoDocuments />)).toMatch(/\/orders\/view\/?\?id=/);
    expect(renderToString(<DemoSettings />)).toContain("Название компании");
    context.actorId = "anna"; context.query = "q=неизвестно";
    expect(renderToString(<DemoOrders mode="orders" />)).toContain("Сбросить фильтры");
  });
  it("highlights static routes with trailing slashes correctly", () => {
    expect(isNavItemActive("/orders", "/orders/", Role.CLIENT)).toBe(true);
    expect(isNavItemActive("/orders", "/orders/new/", Role.CLIENT)).toBe(false);
    expect(isNavItemActive("/offers", "/orders/view/", Role.COMPANY)).toBe(true);
  });
});
