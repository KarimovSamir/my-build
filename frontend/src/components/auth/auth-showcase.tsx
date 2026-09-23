import { OrderStatusBadge } from "@/components/status-badge";
import { showcasePoints, showcaseOrder } from "@/lib/auth-showcase";
import { formatMoney } from "@/lib/format";

/**
 * Тёмная панель справа от форм авторизации (макет 5).
 *
 * Одна на все экраны группы — вход, регистрацию и служебные: они выглядят
 * одинаково, а посетитель по ссылке из письма тоже должен понимать, куда
 * пришёл. На узком экране панели нет вовсе: там она отодвигала бы форму
 * за первый экран, а форма — то, зачем человек сюда открыл страницу.
 */
export function AuthShowcase() {
  return (
    <aside className="bg-brand-ink text-brand-ink-foreground blueprint-grid-ink sticky top-0 hidden h-screen flex-1 overflow-y-auto px-14 py-16 lg:block xl:px-18">
      <p className="text-brand-ink-accent flex items-center gap-2.5 font-mono text-[11px] tracking-[0.12em] uppercase">
        <span className="bg-brand-ink-accent size-2.5" aria-hidden />
        Маркетплейс строительных работ
      </p>

      <p className="font-heading mt-6 max-w-[560px] text-4xl leading-[1.22] font-medium tracking-tight text-balance xl:text-[2.5rem]">
        Заказ, предложения и приёмка —{" "}
        <span className="text-brand-ink-highlight italic">на одном экране</span>
      </p>

      <ol className="mt-11 flex max-w-[520px] flex-col gap-5.5">
        {showcasePoints.map((point) => (
          <li key={point.number} className="flex gap-4">
            <span className="text-brand-ink-accent w-6.5 shrink-0 font-mono text-[13px]" aria-hidden>
              {point.number}
            </span>
            <span>
              <span className="font-heading block text-[17px] font-semibold">{point.title}</span>
              <span className="text-brand-ink-muted mt-1 block text-[0.9rem] leading-relaxed">
                {point.text}
              </span>
            </span>
          </li>
        ))}
      </ol>

      {/* Пример заказа. От читалки спрятан: это картинка того, как выглядит
          кабинет, а не данные, и «ORD-2450» без контекста её только путает. */}
      <div
        className="border-brand-ink-line bg-brand-ink-raised mt-13 max-w-[520px] overflow-hidden rounded-[14px] border"
        aria-hidden
      >
        <div className="border-brand-ink-line flex items-center justify-between gap-3 border-b px-4.5 py-3.5">
          <span className="text-brand-ink-muted font-mono text-[12.5px]">{showcaseOrder.number}</span>
          <OrderStatusBadge status={showcaseOrder.status} />
        </div>
        <div className="p-4.5">
          <p className="font-heading text-[19px] font-semibold">{showcaseOrder.title}</p>
          <div className="mt-3.5 flex items-end justify-between gap-4">
            <div>
              <p className="text-brand-ink-muted font-mono text-[11px] tracking-[0.12em] uppercase">
                Цена сделки
              </p>
              <p className="mt-1 font-mono text-[22px] font-medium">
                {formatMoney(showcaseOrder.price)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-brand-ink-muted font-mono text-[11px] tracking-[0.12em] uppercase">
                Исполнитель
              </p>
              <p className="mt-1 text-[0.9rem] font-semibold">{showcaseOrder.executor}</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
