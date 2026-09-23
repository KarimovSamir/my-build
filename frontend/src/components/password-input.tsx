"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Поле пароля с кнопкой «показать» (макет 5).
 *
 * Пропсы — ровно как у `Input`, чтобы подставляться в `Field` через `inputAs`
 * и не тянуть за собой вторую разметку подписи и ошибки. Кнопка — настоящая
 * `<button type="button">`: иначе Enter в поле отправлял бы не форму, а её.
 */
export function PasswordInput({ className, disabled, ...props }: ComponentProps<typeof Input>) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        disabled={disabled}
        className={cn("pr-11", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        disabled={disabled}
        // Подпись постоянная, состояние сообщает `aria-pressed`: меняй обе —
        // и читалка скажет «Скрыть пароль, нажато», то есть наоборот.
        aria-label="Показать пароль"
        aria-pressed={visible}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50"
      >
        <Icon className="size-4.5" aria-hidden />
      </button>
    </div>
  );
}
