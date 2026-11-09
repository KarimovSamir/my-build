"use client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { chooseActor } from "@/lib/demo/store";
export function SignOutButton({ label, className }: { label?: string; className?: string }) {
  const router = useRouter();
  return <Button variant={label ? "outline" : "ghost"} size={label ? "xl" : "icon"} aria-label="Выйти" title="Выйти" className={className}
    onClick={() => { chooseActor(null); router.replace("/login/"); }}><LogOut className="size-4" />{label}</Button>;
}
