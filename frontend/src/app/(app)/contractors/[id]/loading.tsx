import { DetailSkeleton } from "@/components/detail-skeleton";

/**
 * Карточка подрядчика на время запроса — по тем же соображениям, что и
 * у карточки заказа. Блоков три: «Контакты» слева, «Опыт на площадке»
 * и подсказка про связь — справа.
 */
export default function ContractorLoading() {
  return <DetailSkeleton mainCards={1} asideCards={2} />;
}
