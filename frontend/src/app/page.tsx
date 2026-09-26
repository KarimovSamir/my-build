import { ArrowRight, Check, FileText, ShieldCheck, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { AppPreview } from "@/components/landing/app-preview";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { dealRoute, demoAccountsSummary } from "@/lib/landing";
import { getHomeHref } from "@/lib/navigation";
import { getSessionClaims } from "@/lib/session.server";
import { cn } from "@/lib/utils";

/**
 * Лендинг (ТЗ §7). Публичная страница, доступна без авторизации.
 * Вошедшего пользователя сразу отправляем в его кабинет.
 *
 * Палитра и шрифты — общие с кабинетом (`globals.css`, корневой layout).
 * Своё здесь только чертёжная сетка первого экрана и тёмные полосы
 * на токенах `--brand-ink*`.
 */

const navLinks = [
  { href: "#route", label: "Как это работает" },
  { href: "#client", label: "Клиенту" },
  { href: "#company", label: "Компаниям" },
];

const advantages = [
  {
    icon: ShieldCheck,
    tile: "bg-accent text-accent-foreground",
    title: "Шесть понятных статусов",
    text: "У заказа всегда ровно один статус, и следующий шаг разрешён не всякий. Ни клиент, ни компания не могут «перепрыгнуть» приёмку.",
  },
  {
    icon: FileText,
    tile: "bg-secondary text-secondary-foreground",
    title: "Файлы живут у заказа",
    text: "Чертежи PDF и DWG, фотографии, акты сдачи. Каждый раунд работы — со своим комментарием, и вся история остаётся доступной.",
  },
  {
    icon: Zap,
    tile: "bg-brand-ink text-brand-ink-accent",
    title: "Обновления без перезагрузки",
    text: "Пришло предложение, сменился статус, загружены файлы — экран второй стороны меняется сам, и в колокольчике появляется уведомление.",
  },
];

const roles = [
  {
    id: "client",
    badge: "Клиенту",
    title: "Заказать работы",
    points: [
      "Опишите проект один раз: категория, площадь, адрес, бюджет и чертежи",
      "Сравните цену и срок компаний в одном списке и выберите исполнителя",
      "Примите работу по файлам или верните раунд на доработку",
    ],
    ctaLabel: "Разместить заказ",
  },
  {
    id: "company",
    badge: "Компаниям",
    title: "Получать заказы",
    points: [
      "Лента заказов с бюджетом клиента и приложенными чертежами",
      "Одно предложение на заказ — можно изменить или отозвать до выбора",
      "Сдача работы раундами: файлы, комментарий, сохранённая история",
    ],
    ctaLabel: "Получать заказы",
  },
];

export default async function LandingPage() {
  const claims = await getSessionClaims();

  if (claims) {
    redirect(getHomeHref(claims.role));
  }

  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <header className="border-border bg-background/85 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between gap-6 px-5 lg:px-8">
          <Logo href="/" />

          <nav className="text-muted-foreground hidden items-center gap-7 text-sm lg:flex">
            {navLinks.map(({ href, label }) => (
              <Link key={href} href={href} className="hover:text-foreground transition-colors">
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="outline" asChild className="h-11 px-4 text-sm">
              <Link href="/login">Войти</Link>
            </Button>
            <Button
              asChild
              className="bg-foreground text-background hover:bg-foreground/85 hidden h-11 px-4 text-sm sm:inline-flex"
            >
              <Link href="/register">Регистрация</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="blueprint-grid border-border border-b">
          <div className="mx-auto w-full max-w-7xl px-5 pt-16 pb-14 lg:px-8 lg:pt-20 lg:pb-16">
            <div className="flex flex-col items-center text-center">
              <p className="text-primary font-mono flex items-center gap-2.5 text-xs tracking-[0.14em] uppercase">
                <span className="bg-primary size-2.5" aria-hidden />
                Маркетплейс строительных работ · Баку
              </p>

              <h1 className="font-heading mt-6 max-w-4xl text-4xl leading-[1.08] font-medium tracking-tight text-balance sm:text-5xl lg:text-[4.125rem]">
                Стройка, в которой виден <span className="text-primary italic">каждый шаг</span>
              </h1>

              <p className="text-muted-foreground mt-6 max-w-2xl text-lg leading-relaxed text-pretty">
                Клиент публикует заказ с чертежами и бюджетом. Строительные компании присылают
                свою цену и срок. Клиент выбирает исполнителя и принимает работу по файлам —
                а не по обещаниям на словах. Обе стороны всё время видят один и тот же статус.
              </p>

              <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Button asChild className="h-14 px-7 text-base font-bold">
                  <Link href="/register">
                    Разместить заказ
                    <ArrowRight className="size-[1.125rem]" />
                  </Link>
                </Button>
                <Button variant="outline" asChild className="border-foreground h-14 px-7 text-base">
                  <Link href="/register">Я строительная компания</Link>
                </Button>
              </div>

              <p className="text-muted-foreground font-mono mt-5 text-sm text-balance">
                Демо открыто — на странице входа готовые аккаунты {demoAccountsSummary()}
              </p>
            </div>

            <div className="mt-12 lg:mt-14">
              <AppPreview />
            </div>
          </div>
        </section>

        <section className="bg-brand-ink text-brand-ink-foreground">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-14 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div>
              <p className="text-brand-ink-accent font-mono text-xs tracking-[0.14em] uppercase">
                Демо без регистрации
              </p>
              <h2 className="font-heading mt-4 text-3xl font-medium tracking-tight sm:text-[2.625rem] sm:leading-[1.12]">
                Начните с одного заказа
              </h2>
              <p className="text-brand-ink-muted mt-3.5 max-w-2xl leading-relaxed text-pretty">
                На странице входа есть готовые аккаунты {demoAccountsSummary()} — можно
                пройти сделку целиком, от публикации заказа до приёмки работы.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
              <Button asChild className="h-14 px-7 text-base font-bold">
                <Link href="/login">
                  Открыть демо
                  <ArrowRight className="size-[1.125rem]" />
                </Link>
              </Button>
              <Button
                variant="outline"
                asChild
                className="border-brand-ink-muted/45 text-brand-ink-foreground hover:bg-brand-ink-foreground/10 hover:text-brand-ink-foreground h-14 bg-transparent px-7 text-base"
              >
                <Link href="/register">Зарегистрироваться</Link>
              </Button>
            </div>
          </div>
        </section>

        <section id="route" className="mx-auto w-full max-w-7xl px-5 py-20 lg:px-8 lg:py-24">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-primary font-mono text-xs tracking-[0.14em] uppercase">
                Маршрут сделки
              </p>
              <h2 className="font-heading mt-4 max-w-2xl text-3xl font-medium tracking-tight text-balance sm:text-[2.75rem] sm:leading-[1.1]">
                Никаких «а что сейчас происходит»
              </h2>
            </div>
            <p className="text-muted-foreground max-w-md leading-relaxed">
              Заказ не «висит в переписке»: у него ровно один статус, и перейти из него можно
              только в разрешённый следующий. Одинаково у клиента и у компании.
            </p>
          </div>

          <ol className="border-foreground mt-10 grid border-t sm:grid-cols-2 lg:mt-12 lg:grid-cols-6">
            {dealRoute.map((step, index) => (
              <li
                key={step.status}
                className={cn(
                  "border-border pt-6 pb-6 sm:px-5 sm:first:pl-0 lg:border-r lg:pb-10 lg:last:border-r-0 lg:last:pr-0",
                  step.current && "from-accent bg-gradient-to-b to-transparent",
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "size-2.5 rounded-full",
                      step.current
                        ? "bg-primary ring-primary/20 ring-4"
                        : index < dealRoute.findIndex((item) => item.current)
                          ? "bg-foreground"
                          : "bg-border",
                    )}
                    aria-hidden
                  />
                  <span
                    className={cn(
                      "font-mono text-xs tracking-[0.1em]",
                      step.current ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>

                <p
                  className={cn(
                    "font-heading mt-4 text-lg leading-snug font-semibold",
                    step.current && "text-primary",
                  )}
                >
                  {step.label}
                </p>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{step.note}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="relative isolate overflow-hidden">
          <Image
            src="/landing-site.jpg"
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
            aria-hidden
          />
          <div
            className="from-brand-ink via-brand-ink/80 to-brand-ink/35 absolute inset-0 bg-gradient-to-r"
            aria-hidden
          />
          <div className="relative mx-auto w-full max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
            <p className="text-brand-ink-accent font-mono text-xs tracking-[0.14em] uppercase">
              Что видно обеим сторонам
            </p>
            <p className="font-heading text-brand-ink-foreground mt-6 max-w-3xl text-2xl leading-snug text-pretty sm:text-[2.375rem] sm:leading-[1.3]">
              У заказа всегда один статус — от «поиска исполнителя» до «завершён». Клиент и
              компания смотрят на одну и ту же строку, и она меняется у обоих в тот же момент.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-5 pt-20 lg:px-8 lg:pt-24">
          <div className="grid gap-6 lg:grid-cols-3">
            {advantages.map(({ icon: Icon, tile, title, text }) => (
              <Card key={title} className="[--card-spacing:--spacing(7)]">
                <CardContent className="flex flex-col gap-0">
                  <span
                    className={cn("flex size-11 items-center justify-center rounded-xl", tile)}
                    aria-hidden
                  >
                    <Icon className="size-5" />
                  </span>
                  <p className="font-heading mt-5 text-xl font-semibold tracking-tight">{title}</p>
                  <p className="text-muted-foreground mt-2.5 leading-relaxed">{text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-5 pt-6 pb-20 lg:px-8 lg:pb-24">
          <div className="grid gap-6 lg:grid-cols-2">
            {roles.map(({ id, badge, title, points, ctaLabel }) => (
              <Card key={id} id={id} className="scroll-mt-24 [--card-spacing:--spacing(8)]">
                <CardContent className="flex flex-col gap-0">
                  <p className="text-primary font-mono text-xs tracking-[0.13em] uppercase">
                    {badge}
                  </p>
                  <p className="font-heading mt-4 text-3xl font-semibold tracking-tight">{title}</p>

                  <ul className="mt-6 flex flex-col gap-3.5">
                    {points.map((point) => (
                      <li key={point} className="flex gap-3.5">
                        <Check className="text-primary mt-1 size-[1.15rem] shrink-0" aria-hidden />
                        <span className="leading-relaxed">{point}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    variant="outline"
                    asChild
                    className="border-foreground mt-7 h-12 w-fit px-5 text-[0.95rem]"
                  >
                    <Link href="/register">
                      {ctaLabel}
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>

      <footer className="bg-brand-ink text-brand-ink-muted">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8 lg:px-8">
          <Link
            href="/"
            className="font-heading text-brand-ink-foreground focus-visible:ring-ring rounded-md text-lg font-semibold tracking-tight focus-visible:ring-2 focus-visible:outline-none"
          >
            MyBuild
          </Link>
          <p className="font-mono text-xs">
            © {new Date().getFullYear()} MyBuild · Баку, Азербайджан
          </p>
        </div>
      </footer>
    </div>
  );
}
