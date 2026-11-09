"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDemo } from "./provider";
import { canDeleteDemoFile } from "@/lib/demo/operations";
import { browserApi } from "@/lib/api.client";
import { errorMessage } from "@/lib/demo/store";

export function DeleteFileButton({ fileId, fileName }: { fileId: string; fileName: string }) {
  const { state, actorId } = useDemo();
  const [pending, setPending] = useState(false);
  const order = state?.orders.find((o) => o.files.some((f) => f.id === fileId));
  if (!order || !actorId || !canDeleteDemoFile(order, fileId, actorId)) return null;
  async function remove() {
    if (!window.confirm(`Удалить файл «${fileName}» из этой копии демо?`)) return;
    setPending(true);
    try { await browserApi.delete(`/documents/${fileId}`); toast.success("Файл удалён"); }
    catch (error) { toast.error("Не удалось удалить файл", { description: errorMessage(error) }); }
    finally { setPending(false); }
  }
  return <Button variant="ghost" size="sm" disabled={pending} onClick={() => void remove()} aria-label={`Удалить файл ${fileName}`}>
    <Trash2 className="size-4" aria-hidden />{pending ? "Удаляем…" : "Удалить"}
  </Button>;
}
