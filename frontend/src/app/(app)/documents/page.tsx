import { Suspense } from "react";
import { DemoDocuments } from "@/components/demo/screens";
export default function Page() { return <Suspense fallback={<p role="status">Загружаем раздел…</p>}><DemoDocuments  /></Suspense>; }
