"use client";

import { useRouter } from "next/navigation";
import { AuthHeader } from "@/components/auth/auth-header";
import { Button } from "@/components/ui/button";
import { DemoGate, useDemo } from "./provider";
import { chooseActor } from "@/lib/demo/store";
import { getHomeHref } from "@/lib/navigation";
import { Role } from "@/lib/types";

export default function DemoEntry() {
  const { state } = useDemo();
  const router = useRouter();
  return <DemoGate>
    <div className="flex flex-col gap-7">
      <AuthHeader title="Посмотреть MyBuild" description="Выберите, с чьей стороны посмотреть проект. Пароль и регистрация не нужны." />
      {state?.users.map((user) => <Button key={user.id} size="xl" variant={user.role === Role.CLIENT ? "default" : "outline"}
        onClick={() => { chooseActor(user.id); router.push(getHomeHref(user.role)); }}>
        {user.role === Role.CLIENT ? `Клиент — ${user.firstName} ${user.lastName ?? ""}` : `Компания — ${user.companyName}`}
      </Button>)}
      <p className="text-muted-foreground text-sm leading-relaxed">У каждого посетителя своя копия демо. Создайте заказ, переключитесь на компанию, предложите условия и примите их от лица клиента.</p>
    </div>
  </DemoGate>;
}
