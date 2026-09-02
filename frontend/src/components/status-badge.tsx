import {
  CheckCircle2,
  Clock,
  Hammer,
  RotateCcw,
  Search,
  type LucideIcon,
} from "lucide-react";

import {
  type OfferStatus,
  type OrderStatus,
  type StatusTone,
  offerStatusLabels,
  offerStatusTones,
  orderStatusLabels,
  orderStatusTones,
} from "@mybuild/shared";
import { cn } from "@/lib/utils";

/**
 * Badge статуса — один компонент на все экраны.
 *
 * Цвет и текст берутся из `shared/`, поэтому статус заказа выглядит одинаково
 * в кабинете клиента и в кабинете компании (ТЗ §7, «UX-замечания»).
 */

const toneClasses: Record<StatusTone, string> = {
  gray: "bg-tone-gray text-tone-gray-foreground",
  yellow: "bg-tone-yellow text-tone-yellow-foreground",
  blue: "bg-tone-blue text-tone-blue-foreground",
  green: "bg-tone-green text-tone-green-foreground",
  red: "bg-tone-red text-tone-red-foreground",
};

const orderStatusIcons: Record<OrderStatus, LucideIcon> = {
  WAITING: Search,
  AWAITING_CONFIRMATION: Clock,
  IN_PROGRESS: Hammer,
  AWAITING_COMPLETION_CONFIRMATION: Clock,
  COMPLETED: CheckCircle2,
  COMPLETION_DISPUTED: RotateCcw,
};

interface BadgeShellProps {
  tone: StatusTone;
  icon: LucideIcon;
  label: string;
  className?: string;
}

function BadgeShell({ tone, icon: Icon, label, className }: BadgeShellProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        toneClasses[tone],
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {label}
    </span>
  );
}

export function OrderStatusBadge({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  return (
    <BadgeShell
      tone={orderStatusTones[status]}
      icon={orderStatusIcons[status]}
      label={orderStatusLabels[status]}
      className={className}
    />
  );
}

export function OfferStatusBadge({
  status,
  className,
}: {
  status: OfferStatus;
  className?: string;
}) {
  return (
    <BadgeShell
      tone={offerStatusTones[status]}
      icon={Clock}
      label={offerStatusLabels[status]}
      className={className}
    />
  );
}
