/**
 * Преобразования значений, общие для всех DTO.
 *
 * Живут отдельно, потому что нужны везде, где форма приходит как multipart:
 * там любое поле доезжает строкой, а незаполненное — пустой строкой, а не
 * отсутствующим ключом. Третья копия этих четырёх строк в очередном DTO
 * означала бы, что где-то одну из них поправят, а остальные забудут.
 */

import { Transform } from 'class-transformer';

/** Обрезает пробелы по краям. */
export const trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

/**
 * То же плюс: пустая строка считается отсутствующим значением.
 * Браузер отправляет незаполненные поля формы именно так.
 */
export const optionalText = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value ?? undefined;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  });
