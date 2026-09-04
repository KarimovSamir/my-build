"use client";

/**
 * Последняя граница: отказ в корневом layout'е, когда не отрисовалось вообще
 * ничего. Файл подменяет корневой layout целиком, поэтому у него свои
 * `<html>` и `<body>`.
 *
 * Стили здесь инлайновые намеренно: `global-error` рендерит собственный
 * документ и глобальные стили приложения в него не попадают — классы Tailwind
 * и токены темы тут просто не существуют.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          fontFamily: "system-ui, sans-serif",
          background: "#f8fafc",
          color: "#0f172a",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>
            Приложение не смогло запуститься
          </h1>
          <p style={{ margin: "0.5rem 0 1.25rem", fontSize: "0.875rem", color: "#475569" }}>
            Попробуйте обновить страницу. Если ошибка повторяется, вернитесь
            через несколько минут.
          </p>

          <button
            type="button"
            onClick={retry}
            style={{
              cursor: "pointer",
              borderRadius: "0.75rem",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              color: "inherit",
            }}
          >
            Повторить
          </button>

          {error.digest ? (
            <p style={{ marginTop: "1rem", fontSize: "0.75rem", color: "#64748b" }}>
              Код ошибки: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
