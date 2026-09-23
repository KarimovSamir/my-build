"use client";

import { FileText, Image as ImageIcon, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import {
  ALLOWED_FILE_EXTENSIONS,
  ALLOWED_FILE_EXTENSIONS_HINT,
  MAX_FILES_PER_REQUEST,
  MAX_FILE_SIZE_BYTES,
  MAX_ORDER_FILES_BYTES,
} from "@/lib/types";

import { Button } from "@/components/ui/button";
import { isImageFileName } from "@/lib/file-kind";
import { formatFileSize } from "@/lib/format";
import { addFiles } from "@/lib/order-form";
import { cn } from "@/lib/utils";

/**
 * Выбор файлов заказа: перетаскиванием или через диалог (ТЗ §7).
 *
 * Файлы никуда не уходят до отправки формы — они лежат здесь и до последнего
 * момента могут быть убраны. Тип, размер и количество проверяются на месте:
 * узнать про отклонённый файл после загрузки двадцати мегабайт — плохой обмен.
 * Настоящая проверка всё равно на backend (ТЗ §6).
 */
export function FileDropzone({
  id,
  files,
  onChange,
  disabled,
  usedBytes = 0,
  takenNames,
}: {
  /** Идентификатор области выбора: на неё указывает подпись поля. */
  id: string;
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  /**
   * Сколько уже занято файлами этого заказа. У нового заказа — ноль, поэтому
   * значение по умолчанию: форма создания ничем не занята по определению.
   */
  usedBytes?: number;
  /**
   * Имена, уже приложенные туда же, куда уйдёт загрузка. У нового заказа их
   * нет; у сдачи это её файлы — одноимённые в списке неразличимы.
   */
  takenNames?: readonly string[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);

  // Занятое вместе с тем, что уже выбрано, но ещё не отправлено: счётчик
  // отвечает на вопрос «сколько останется, если я нажму загрузить».
  const occupied = usedBytes + files.reduce((total, file) => total + file.size, 0);

  function accept(incoming: FileList | null) {
    if (!incoming?.length) return;

    const result = addFiles(files, [...incoming], usedBytes, takenNames);
    setRejected(result.rejected);
    onChange(result.files);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    if (!disabled) accept(event.dataTransfer.files);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    // Без preventDefault браузер откроет файл в соседней вкладке.
    event.preventDefault();
    if (!disabled) setDragging(true);
  }

  function remove(index: number) {
    setRejected([]);
    onChange(files.filter((_, position) => position !== index));
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "border-border bg-brand-surface hover:border-primary/60 hover:bg-accent/40 focus-visible:ring-ring/50 flex flex-col items-center gap-2 rounded-xl border-[1.5px] border-dashed px-5 py-8 text-center transition-colors focus-visible:ring-3 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60",
          dragging && "border-primary bg-accent",
        )}
      >
        <Upload className="text-primary size-7" strokeWidth={1.7} aria-hidden />
        <span className="text-[0.9375rem]">
          <span className="text-primary font-semibold">Выберите файлы</span>
          <span className="text-secondary-foreground"> или перетащите сюда</span>
        </span>
        <span className="text-muted-foreground font-mono text-xs">
          {ALLOWED_FILE_EXTENSIONS_HINT} · до {MAX_FILE_SIZE_BYTES / 1024 / 1024} МБ ·
          не больше {MAX_FILES_PER_REQUEST} за раз
        </span>
        <span className="text-muted-foreground font-mono text-xs">
          файлы заказа: {formatFileSize(occupied)} из{" "}
          {formatFileSize(MAX_ORDER_FILES_BYTES)}
        </span>
      </button>

      <input
        ref={inputRef}
        // Поле служебное — его открывает кнопка выше, а форма собирается
        // вручную. Имя всё равно нужно: браузер ругается на поле без него.
        name={`${id}-input`}
        type="file"
        multiple
        hidden
        accept={ALLOWED_FILE_EXTENSIONS.join(",")}
        onChange={(event) => {
          accept(event.target.files);
          // Иначе повторный выбор того же файла после удаления не сработает:
          // значение поля не изменилось, и события `change` не будет.
          event.target.value = "";
        }}
      />

      {rejected.length > 0 ? (
        <ul className="text-destructive flex flex-col gap-1 text-[0.8125rem]" role="alert">
          {rejected.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}

      {files.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {files.map((file, index) => (
            <SelectedFile
              key={`${file.name}-${file.size}`}
              file={file}
              disabled={disabled}
              onRemove={() => remove(index)}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function SelectedFile({
  file,
  disabled,
  onRemove,
}: {
  file: File;
  disabled?: boolean;
  onRemove: () => void;
}) {
  const preview = useImagePreview(file);

  return (
    <li className="border-border flex items-center gap-3.5 rounded-xl border px-4 py-3">
      <span className="bg-accent text-primary flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg">
        {preview ? (
          // Обычный <img>: файл лежит в памяти браузера, next/image здесь
          // нечего оптимизировать.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="size-full object-cover" />
        ) : (
          <FileIcon name={file.name} />
        )}
      </span>

      <span className="min-w-0 flex-1">
        {/* Имя переносится, а не обрезается — как в строке файла заказа
            (`FileRow`): на узком экране обрезка съедала расширение. */}
        <span className="block text-[0.9375rem] font-semibold break-words">{file.name}</span>
        <span className="text-muted-foreground mt-0.5 block font-mono text-xs">
          {formatFileSize(file.size)}
        </span>
      </span>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        onClick={onRemove}
        aria-label={`Убрать файл ${file.name}`}
      >
        <X className="size-4" />
      </Button>
    </li>
  );
}

function FileIcon({ name }: { name: string }) {
  const Icon = isImageFileName(name) ? ImageIcon : FileText;

  return <Icon className="size-[1.0625rem]" aria-hidden />;
}

/** Превью картинки из памяти браузера. Ссылка освобождается вместе со строкой. */
function useImagePreview(file: File): string | null {
  const url = useMemo(
    () => (isImageFileName(file.name) ? URL.createObjectURL(file) : null),
    [file],
  );

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  return url;
}
