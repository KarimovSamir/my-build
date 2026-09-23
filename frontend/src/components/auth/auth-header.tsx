import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Заголовок экрана авторизации: крупная антиква и строка под ней (макет 5).
 *
 * Общий для всех экранов группы — от входа до «Роль не определена»:
 * служебные экраны по плану выглядят так же, как вход, и кегль заголовка
 * не должен расходиться между ними.
 */
export function AuthHeader({
  title,
  description,
}: {
  title: string;
  description?: ReactNode;
}) {
  return (
    <div>
      <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-[2.375rem] sm:leading-tight">
        {title}
      </h1>
      {description ? (
        <p className="text-muted-foreground mt-2.5 text-[0.97rem] leading-relaxed">{description}</p>
      ) : null}
    </div>
  );
}

/** Строка-переход под формой: «Нет аккаунта? Зарегистрироваться». */
export function AuthSwitch({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground text-center text-[0.9rem]">{children}</p>;
}

/** Ссылка на соседний экран группы — терракотой и полужирным, как на макете. */
export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="text-primary focus-visible:ring-ring rounded-sm font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none"
    >
      {children}
    </Link>
  );
}
