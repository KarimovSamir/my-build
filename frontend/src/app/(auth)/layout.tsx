import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

/** Оболочка экранов входа и регистрации: логотип и карточка по центру. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-12">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <Logo href="/" size="lg" />
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
