import { Suspense } from "react";
import { DemoSettings } from "@/components/demo/screens";
export default function Page() { return <Suspense fallback={<p role="status">Загружаем раздел…</p>}><DemoSettings  /></Suspense>; }
