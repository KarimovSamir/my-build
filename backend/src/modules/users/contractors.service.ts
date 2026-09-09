/**
 * Каталог подрядчиков (ТЗ §5). На MVP это справочник: рейтингов и отзывов
 * нет (ТЗ §11), поэтому единственное «достижение» компании в карточке —
 * число завершённых заказов.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import type { ContractorCard, Paginated } from '@mybuild/shared';

import type { SearchQueryDto } from '../../common/dto/pagination.dto.js';
import { pageRequest, toPage } from '../../common/pagination.js';
import { isUuid } from '../../common/uuid.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { COMPLETED_OFFERS_FILTER, buildContractorsWhere } from './contractor-search.js';

const NOT_FOUND = 'Подрядчик не найден';

/**
 * Что читается из базы под карточку. Число завершённых заказов считает сам
 * Postgres (`_count` с фильтром) — отдельным запросом на строку это дало бы
 * по запросу на каждую компанию в списке.
 */
const CONTRACTOR_SELECT = {
  id: true,
  companyName: true,
  city: true,
  country: true,
  email: true,
  phone: true,
  _count: { select: { offers: { where: COMPLETED_OFFERS_FILTER } } },
} satisfies Prisma.UserSelect;

type ContractorRow = Prisma.UserGetPayload<{ select: typeof CONTRACTOR_SELECT }>;

/** Алфавит, а не «лучшие сверху»: сортировать по заслугам на MVP нечем. */
const ORDER_BY: Prisma.UserOrderByWithRelationInput[] = [
  { companyName: 'asc' },
  { id: 'asc' },
];

@Injectable()
export class ContractorsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: SearchQueryDto): Promise<Paginated<ContractorCard>> {
    const where = buildContractorsWhere(query.q);
    const request = pageRequest(query);

    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: CONTRACTOR_SELECT,
        orderBy: ORDER_BY,
        skip: request.skip,
        take: request.pageSize,
      }),
    ]);

    return toPage(rows.map(toContractorCard), request, total);
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
      select: CONTRACTOR_SELECT,
      take: 1,
    });

    if (!row) {
      throw new NotFoundException(NOT_FOUND);
    }

    return toContractorCard(row);
  }
}

/**
 * Строка базы → контракт API. Счётчик разбирается через деструктуризацию,
 * а не читается полем: `_count` — имя из Prisma, и обращение к нему точкой
 * линтер считает нарушением (`no-underscore-dangle`).
 */
function toContractorCard({ _count, ...row }: ContractorRow): ContractorCard {
  return {
    id: row.id,
    // Выборка отбирает строки с `companyName IS NOT NULL`, и то же гарантирует
    // CHECK-ограничение на таблице (ТЗ §3). Типам Prisma об этом неоткуда знать.
    companyName: row.companyName!,
    city: row.city,
    country: row.country,
    email: row.email,
    phone: row.phone,
    completedOrdersCount: _count.offers,
  };
}
