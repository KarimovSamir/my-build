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
      <SheetContent side="left" className="bg-sidebar w-64 p-0">
        <SheetTitle className="sr-only">Навигация</SheetTitle>
        <SidebarContent user={user} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
