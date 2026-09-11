import { DetailSkeleton } from "@/components/detail-skeleton";

/**
 * Карточка подрядчика на время запроса — по тем же соображениям, что и
 * у карточки заказа. Блоков ровно два: «Контакты» и «Опыт на площадке».
 */
export default function ContractorLoading() {
  return <DetailSkeleton mainCards={1} asideCards={1} />;
}
