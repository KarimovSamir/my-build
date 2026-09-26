import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Оболочка экранов входа, регистрации и служебных: форма в карточке по центру
 * окна, вокруг — чертёжная сетка лендинга.
 *
 * Боковых панелей нет намеренно: взгляд приходит в центр экрана, и там должна
 * быть форма, а не рассказ о продукте, — рассказ живёт на лендинге. Сетка
 * гаснет к краям, чтобы пустые поля не выглядели недостроенной страницей.
 * На телефоне нет ни карточки, ни сетки: полей по бокам там нет, а линии
 * шли бы прямо под текстом формы.
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="relative isolate flex min-h-screen flex-col">
      <div
        className="blueprint-grid absolute inset-0 -z-10 hidden sm:block [mask-image:radial-gradient(ellipse_75%_70%_at_50%_40%,black_45%,transparent_100%)]"
        aria-hidden
      />

      <div className="flex items-center justify-between gap-4 px-4 pt-6 sm:px-10 lg:px-14">
        <Logo href="/" size="md" />
        <ThemeToggle />
      </div>

      {/* `my-auto` у карточки: короткий экран встаёт по центру окна, а длинный
          (регистрация, вход с демо-доступом) начинается сверху и прокручивается. */}
      <main className="flex flex-1 flex-col items-center px-4 pt-10 pb-12 sm:px-6 sm:pt-12">
        <div className="sm:border-border sm:bg-card my-auto w-full max-w-[496px] sm:max-w-[576px] sm:rounded-2xl sm:border sm:px-10 sm:py-11 sm:shadow-[0_24px_60px_rgba(34,28,23,0.08)] dark:sm:shadow-[0_24px_60px_rgba(0,0,0,0.4)]">
          {children}
        </div>
      </main>
    </div>
  );
}
