import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileText,
  HardHat,
  MessageSquareQuote,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Лендинг (ТЗ §7). Публичная страница, доступна без авторизации.
 *
 * Редирект авторизованного пользователя на его кабинет добавится в Фазе 2,
 * когда появится настоящая сессия.
 */

const clientSteps = [
  {
    icon: ClipboardList,
    title: "Опишите проект",
    text: "Категория, тип объекта, площадь, адрес, бюджет и файлы — всё в одной форме.",
  },
  {
    icon: MessageSquareQuote,
    title: "Сравните предложения",
    text: "Компании присылают свою цену и срок. Вы видите их рядом и выбираете одно.",
  },
  {
    icon: CheckCircle2,
    title: "Примите работу",
    text: "Исполнитель сдаёт результат с файлами. Вы подтверждаете или отправляете на доработку.",
  },
];

const companySteps = [
  {
    icon: HardHat,
    title: "Смотрите заказы",
    text: "Лента новых заказов с ожиданиями клиента по бюджету — сразу понятно, браться или нет.",
  },
  {
    icon: Wallet,
    title: "Предлагайте цену и срок",
    text: "Одно предложение на заказ. Его можно обновить или отозвать, пока клиент не выбрал.",
  },
  {
    icon: FileText,
    title: "Сдавайте работу",
    text: "Приложите файлы и комментарий. История сдач сохраняется целиком.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-border bg-background/80 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 lg:px-8">
          <Logo href="/" />
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/login">Войти</Link>
            </Button>
            <Button asChild>
              <Link href="/register">Зарегистрироваться</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-4 py-16 lg:px-8 lg:py-24">
          <div className="max-w-3xl">
            <p className="text-primary text-sm font-medium">Маркетплейс для строительства</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Заказ, предложения, контроль работ — в одном месте
            </h1>
            <p className="text-muted-foreground mt-5 text-lg text-pretty">
              MyBuild соединяет тех, кому нужно построить или отремонтировать, со
              строительными компаниями. Клиент публикует заказ и сам выбирает
              исполнителя по цене и сроку. Компания видит заказы и предлагает свои
              условия. Каждый шаг сделки виден обеим сторонам.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link href="/register">
                  Начать
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/login">У меня уже есть аккаунт</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="border-border bg-card border-y">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-16 lg:grid-cols-2 lg:px-8">
            <Scenario
              badge="Я клиент"
              title="Хочу заказать работы"
              steps={clientSteps}
              ctaHref="/register"
              ctaLabel="Разместить заказ"
            />
            <Scenario
              badge="Я компания"
              title="Хочу получать заказы"
              steps={companySteps}
              ctaHref="/register"
              ctaLabel="Получать заказы"
            />
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-16 lg:px-8">
          <h2 className="text-2xl font-semibold tracking-tight">Почему так спокойнее</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <Highlight
              icon={ShieldCheck}
              title="Понятные статусы"
              text="У заказа один явный статус на каждом шаге — от поиска исполнителя до приёмки. Обе стороны видят одно и то же."
            />
            <Highlight
              icon={Wallet}
              title="Цена фиксируется сделкой"
              text="Бюджет клиента — это ориентир. Настоящая цена появляется только когда предложение принято."
            />
            <Highlight
              icon={FileText}
              title="Файлы не теряются"
              text="Чертежи, фотографии и акты хранятся у заказа, а вся история сдач остаётся доступной."
            />
          </div>
        </section>
      </main>

      <footer className="border-border border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm lg:px-8">
          <Logo href="/" size={24} />
          <p>© {new Date().getFullYear()} MyBuild</p>
        </div>
      </footer>
    </div>
  );
}

function Scenario({
  badge,
  title,
  steps,
  ctaHref,
  ctaLabel,
}: {
  badge: string;
  title: string;
  steps: { icon: typeof ClipboardList; title: string; text: string }[];
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <Card className="bg-background h-full">
      <CardHeader>
        <p className="text-primary text-sm font-medium">{badge}</p>
        <CardTitle className="text-xl">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <ol className="flex flex-col gap-4">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className="flex gap-3">
                <span className="bg-accent text-accent-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
                  <Icon className="size-4.5" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-medium">{step.title}</span>
                  <span className="text-muted-foreground block text-sm">{step.text}</span>
                </span>
              </li>
            );
          })}
        </ol>
        <Button variant="outline" className="w-fit" asChild>
          <Link href={ctaHref}>
            {ctaLabel}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function Highlight({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof ShieldCheck;
  title: string;
  text: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 pt-6">
        <Icon className="text-primary size-5" aria-hidden />
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground text-sm">{text}</p>
      </CardContent>
    </Card>
  );
}
