import { AuthHeader, AuthLink, AuthSwitch } from "@/components/auth/auth-header";
import { DemoInvite } from "@/components/auth/demo-invite";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata = { title: "Регистрация" };

export default function RegisterPage() {
  return (
    <div className="flex flex-col gap-8">
      <AuthHeader
        title="Регистрация"
        description="Клиент размещает заказы, строительная компания на них отвечает"
      />

      {/* Приглашение в демо — до формы: посетителю, который пришёл только
          посмотреть, незачем пролистывать десять полей, чтобы узнать об этом. */}
      <DemoInvite />

      <div className="flex flex-col gap-5">
        <RegisterForm />

        <AuthSwitch>
          Уже есть аккаунт? <AuthLink href="/login">Войти</AuthLink>
        </AuthSwitch>
      </div>
    </div>
  );
}
