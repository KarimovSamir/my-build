import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { AuthHeader } from "@/components/auth/auth-header";
import { Button } from "@/components/ui/button";
import { PASSWORD_RECOVERY_UNAVAILABLE } from "@/lib/demo";

export const metadata = { title: "Восстановление пароля" };

/**
 * Восстановление пароля в демо недоступно: письма посторонним адресам не
 * доставляются (`PASSWORD_RECOVERY_UNAVAILABLE`). Экран остаётся, потому что
 * сюда ведут прямой адрес и «Запросить новую ссылку» с `/reset-password`, —
 * и говорит то же, что плашка на «Забыли пароль?» у входа.
 */
export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-8">
      <AuthHeader
        title={PASSWORD_RECOVERY_UNAVAILABLE.title}
        description={PASSWORD_RECOVERY_UNAVAILABLE.description}
      />

      <Button asChild size="xl" className="w-full">
        <Link href="/login">
          Войти в демо-аккаунт
          <ArrowRight aria-hidden />
        </Link>
      </Button>
    </div>
  );
}
