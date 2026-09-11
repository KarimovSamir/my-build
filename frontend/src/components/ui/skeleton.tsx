import { cn } from "@/lib/utils"

/**
 * Полоска-заглушка на время загрузки.
 *
 * Цвет — `foreground/10`, а не `bg-muted` из поставки shadcn: в тёмной теме
 * пресета Nova токены `--muted` и `--card` совпадают, и заглушка внутри
 * карточки становилась невидимой — вместо скелета пользователь видел пустые
 * прямоугольники. Полупрозрачный основной цвет заметен на любой подложке,
 * и обе темы остаются при своих токенах.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-foreground/10", className)}
      {...props}
    />
  )
}

export { Skeleton }
