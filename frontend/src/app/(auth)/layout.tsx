import { AuthShowcase } from "@/components/auth/auth-showcase";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Оболочка экранов входа, регистрации и служебных (макет 5): форма слева,
 * тёмная панель справа.
 *
 * Панель прилипает к окну, а прокручивается только левая колонка: форма
 * регистрации длиннее экрана, и без этого панель уезжала бы вверх вместе
 * с полями, оставляя справа пустой фон.
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen">
      <div className="flex w-full min-w-0 flex-col px-4 pt-6 pb-12 sm:px-10 lg:w-[560px] lg:shrink-0 lg:px-14 lg:pt-12 xl:w-[640px] xl:px-18">
        <div className="flex items-center justify-between gap-4">
          <Logo href="/" size="md" />
          <ThemeToggle />
        </div>

        <main className="mx-auto mt-10 flex w-full max-w-[496px] flex-1 flex-col lg:mx-0 lg:mt-11">
          {children}
        </main>
      </div>

      <AuthShowcase />
    </div>
  );
}
