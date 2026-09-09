/**
 * Каталог подрядчиков (ТЗ §5). На MVP это справочник: рейтингов и отзывов
 * нет (ТЗ §11), поэтому единственное «достижение» компании в карточке —
 * число завершённых заказов.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import type { ContractorCard, ContractorListItem, Paginated } from '@mybuild/shared';

import type { SearchQueryDto } from '../../common/dto/pagination.dto.js';
import { pageRequest, toPage } from '../../common/pagination.js';
import { isUuid } from '../../common/uuid.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { COMPLETED_OFFERS_FILTER, buildContractorsWhere } from './contractor-search.js';

const NOT_FOUND = 'Подрядчик не найден';

/**
 * Что читается из базы под строку списка. Число завершённых заказов считает сам
 * Postgres (`_count` с фильтром) — отдельным запросом на строку это дало бы
 * по запросу на каждую компанию в списке.
 *
 * Контактов здесь нет: список их не показывает, а страница каталога уезжает
 * в браузер целиком. Один select на оба маршрута отдавал бы почту и телефон
 * каждой компании на каждый запрос списка — то есть выгружал бы контакты всей
 * площадки постранично, ничего ими не рисуя.
 */
const CONTRACTOR_LIST_SELECT = {
  id: true,
  companyName: true,
  city: true,
  country: true,
  _count: { select: { offers: { where: COMPLETED_OFFERS_FILTER } } },
} satisfies Prisma.UserSelect;

/** Карточка одной компании: то же плюс контакты (ТЗ §7). */
const CONTRACTOR_CARD_SELECT = {
  ...CONTRACTOR_LIST_SELECT,
  email: true,
  phone: true,
} satisfies Prisma.UserSelect;

type ContractorListRow = Prisma.UserGetPayload<{ select: typeof CONTRACTOR_LIST_SELECT }>;
type ContractorCardRow = Prisma.UserGetPayload<{ select: typeof CONTRACTOR_CARD_SELECT }>;

/** Алфавит, а не «лучшие сверху»: сортировать по заслугам на MVP нечем. */
const ORDER_BY: Prisma.UserOrderByWithRelationInput[] = [
  { companyName: 'asc' },
  { id: 'asc' },
];

@Injectable()
export class ContractorsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: SearchQueryDto): Promise<Paginated<ContractorListItem>> {
    const where = buildContractorsWhere(query.q);
    const request = pageRequest(query);

    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: CONTRACTOR_LIST_SELECT,
        orderBy: ORDER_BY,
        skip: request.skip,
        take: request.pageSize,
      }),
    ]);

    return toPage(rows.map(toListItem), request, total);
  }

  /**
   * Карточка одной компании. Клиент заказчиком по этому адресу не приходит,
   * поэтому чужая строка отдаётся как «не найдено», а не «нет прав»: каталог
   * открыт целиком, и скрывать здесь нечего — 404 означает ровно то, что
   * компании с таким идентификатором нет.
   */
  async getById(contractorId: string): Promise<ContractorCard> {
    // Колонка `User.id` объявлена как `uuid`: мусор в пути упал бы в Postgres,
    // то есть ушёл бы наружу как 500 вместо 404.
    if (!isUuid(contractorId)) {
      throw new NotFoundException(NOT_FOUND);
    }

    const [row] = await this.prisma.user.findMany({
      // Условие каталога целиком, а не только `id`: по этому адресу нельзя
      // прочитать профиль клиента, подставив его идентификатор.
      where: { ...buildContractorsWhere(), id: contractorId },
      select: CONTRACTOR_CARD_SELECT,
      take: 1,
    });

    if (!row) {
      throw new NotFoundException(NOT_FOUND);
    }

    return toContractorCard(row);
  }
}

/**
 * Строка базы → строка списка. Счётчик разбирается через деструктуризацию,
 * а не читается полем: `_count` — имя из Prisma, и обращение к нему точкой
 * линтер считает нарушением (`no-underscore-dangle`).
 */
function toListItem({ _count, ...row }: ContractorListRow): ContractorListItem {
  return {
    id: row.id,
    // Выборка отбирает строки с `companyName IS NOT NULL`, и то же гарантирует
    // CHECK-ограничение на таблице (ТЗ §3). Типам Prisma об этом неоткуда знать.
    companyName: row.companyName!,
    city: row.city,
    country: row.country,
    completedOrdersCount: _count.offers,
  };
}

/** Строка базы → карточка компании: то же плюс контакты. */
function toContractorCard(row: ContractorCardRow): ContractorCard {
  return { ...toListItem(row), email: row.email, phone: row.phone };
}
