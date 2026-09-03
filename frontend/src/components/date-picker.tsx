"use client";

import { ru } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Выбор календарной даты (ТЗ §7, базовые компоненты).
 *
 * Значение — строка `ГГГГ-ММ-ДД`, а не `Date`: в таком виде дата уходит в API
 * и в таком же возвращается. Момент времени тут не нужен и только мешал бы —
 * при переводе в часовой пояс браузера день сдвигается.
 */
export function DatePicker({
  id,
  value,
  onChange,
  min,
  placeholder = "Выберите дату",
  disabled,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Раньше этого дня выбрать нельзя, тоже `ГГГГ-ММ-ДД`. */
  min?: string;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = toLocalDate(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-invalid={invalid ? true : undefined}
          className={cn(
            "w-full justify-start font-normal",
            !selected && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="size-4" aria-hidden />
          {selected ? formatDate(value) : placeholder}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={ru}
          autoFocus
          selected={selected}
          defaultMonth={selected ?? toLocalDate(min ?? "") ?? undefined}
          disabled={min ? { before: toLocalDate(min) ?? new Date() } : undefined}
          onSelect={(date) => {
            onChange(date ? toIsoDate(date) : "");
            setOpen(false);
          }}
        />

        {value ? (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Очистить
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/**
 * `ГГГГ-ММ-ДД` → дата в часовом поясе браузера.
 * Собирается по частям, а не через `new Date(строка)`: тот разбирает такую
 * запись как полночь UTC, и западнее Гринвича в календаре подсветился бы
 * предыдущий день.
 */
function toLocalDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}
