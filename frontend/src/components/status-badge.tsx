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
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Badge статуса — один компонент на все экраны.
 *
 * Собран на `ui/badge` из дизайн-системы: своя вёрстка разъехалась бы с
 * остальными badge. Меняются только цвета — они берутся из `shared/`, поэтому
 * статус заказа выглядит одинаково в кабинете клиента и в кабинете компании
 * (ТЗ §7, «UX-замечания»).
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
    <Badge
      variant="secondary"
      className={cn("h-auto gap-1.5 rounded-full px-2.5 py-1", toneClasses[tone], className)}
    >
      <Icon aria-hidden />
      {label}
    </Badge>
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
