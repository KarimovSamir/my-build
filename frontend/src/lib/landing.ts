import {
  DEMO_ACCOUNTS,
  OrderStatus,
  Role,
  orderStatusLabels,
  type DemoAccount,
} from "@/lib/types";

/**
 * Маршрут сделки на лендинге (ТЗ §4).
 *
 * Названия шагов берутся из `shared/`, а не пишутся в разметке: посетитель
 * читает на лендинге ровно те слова, которые потом увидит в кабинете. Полнота
 * списка закрыта тестом — новый статус заказа обязан появиться и здесь.
 */

export interface DealRouteStep {
  status: OrderStatus;
  /** Название статуса из `shared/`. */
  label: string;
  /** Что происходит на этом шаге — своими словами, для незнакомого человека. */
  note: string;
  /** Шаг, на котором стоит заказ из макета кабинета выше. Ровно один. */
  current: boolean;
}

const routeNotes: Record<OrderStatus, string> = {
  WAITING: "Заказ опубликован и виден компаниям.",
  AWAITING_CONFIRMATION: "Пришли предложения с ценой и сроком.",
  IN_PROGRESS: "Исполнитель выбран, цена зафиксирована.",
  AWAITING_COMPLETION_CONFIRMATION: "Работа сдана с файлами и комментарием.",
  COMPLETION_DISPUTED: "Клиент вернул раунд с замечаниями.",
  COMPLETED: "Приёмка подтверждена, история закрыта.",
};

/**
 * Порядок шагов — не порядок объявления enum'а: доработка стоит перед
 * завершением, потому что по сделке она и идёт раньше.
 */
const routeOrder: OrderStatus[] = [
  OrderStatus.WAITING,
  OrderStatus.AWAITING_CONFIRMATION,
  OrderStatus.IN_PROGRESS,
  OrderStatus.AWAITING_COMPLETION_CONFIRMATION,
  OrderStatus.COMPLETION_DISPUTED,
  OrderStatus.COMPLETED,
];

/** Шаг, который подсвечен: тот же статус, что у примера заказа в макете. */
const currentStatus: OrderStatus = OrderStatus.IN_PROGRESS;

export const dealRoute: DealRouteStep[] = routeOrder.map((status) => ({
  status,
  label: orderStatusLabels[status],
  note: routeNotes[status],
  current: status === currentStatus,
}));

/** «Трёх компаний» — числительное в родительном падеже, как после «аккаунты». */
const companiesGenitive: Record<number, string> = {
  1: "одной компании",
  2: "двух компаний",
  3: "трёх компаний",
  4: "четырёх компаний",
};

/**
 * Кем можно войти в демо — «клиента и двух компаний». Считается по тому же
 * списку, что рисует экран входа: число, написанное в разметке руками, уже
 * однажды разошлось с ним.
 */
export function demoAccountsSummary(accounts: readonly DemoAccount[] = DEMO_ACCOUNTS): string {
  const companies = accounts.filter((account) => account.role === Role.COMPANY).length;

  return `клиента и ${companiesGenitive[companies] ?? `${companies} компаний`}`;
}
