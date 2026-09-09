import { notFound } from "next/navigation";

import type { ContractorCard } from "@/lib/types";

import { ContractorProfile } from "@/components/contractors/contractor-profile";
import { ApiRequestError } from "@/lib/api";
import { serverApi } from "@/lib/api.server";

export const metadata = { title: "Компания" };

/**
 * Карточка подрядчика (ТЗ §5, §7).
 *
 * Название компании в `metadata` не подставляется: заголовок вкладки стоил бы
 * второго запроса к API за теми же данными — как и на странице заказа.
 *
 * Мусор в адресе и несуществующая компания приходят одинаково — 404: backend
 * намеренно отвечает так на любой идентификатор, которого нет в каталоге.
 */
export default async function ContractorPage({ params }: PageProps<"/contractors/[id]">) {
  const { id } = await params;

  return <ContractorProfile contractor={await loadContractor(id)} />;
}

async function loadContractor(id: string): Promise<ContractorCard> {
  try {
    return await serverApi.get<ContractorCard>(`/contractors/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof ApiRequestError && error.statusCode === 404) {
      notFound();
    }

    throw error;
  }
}
