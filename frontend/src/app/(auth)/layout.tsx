import { Logo } from "@/components/brand/logo";

/** Оболочка экранов входа и регистрации: логотип и карточка по центру. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-12">
      <Logo href="/" size={40} />
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
