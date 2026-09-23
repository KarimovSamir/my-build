import { AuthHeader, AuthLink, AuthSwitch } from "@/components/auth/auth-header";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata = { title: "Восстановление пароля" };

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-8">
      <AuthHeader
        title="Восстановление пароля"
        description="Укажите email, и мы пришлём ссылку для установки нового пароля"
      />

      <div className="flex flex-col gap-5">
        <ForgotPasswordForm />

        <AuthSwitch>
          Вспомнили пароль? <AuthLink href="/login">Войти</AuthLink>
        </AuthSwitch>
      </div>
    </div>
  );
}
