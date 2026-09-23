"use client";

import { Menu } from "lucide-react";
import { useState } from "react";

import { SidebarContent } from "@/components/layout/app-sidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { CurrentUser } from "@/lib/session";

/** На мобильном боковое меню сворачивается в бургер (ТЗ §7, адаптивность). */
export function MobileSidebar({ user }: { user: CurrentUser }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Открыть меню">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      {/*
        Кнопка закрытия у Sheet своя и нарисована светлой темой, а панель
        здесь тёмная — перекрашиваем её по слоту, иначе на `--brand-ink`
        получается светлое пятно с тёмным крестиком.
      */}
      <SheetContent
        side="left"
        className="bg-sidebar w-66 gap-0 p-0 [&_[data-slot=sheet-close]]:text-sidebar-foreground [&_[data-slot=sheet-close]]:hover:bg-sidebar-accent [&_[data-slot=sheet-close]]:hover:text-sidebar-accent-foreground"
      >
        <SheetTitle className="sr-only">Навигация</SheetTitle>
        <SidebarContent user={user} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
