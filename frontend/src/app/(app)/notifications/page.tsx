import { Suspense } from "react";
import { DemoNotifications } from "@/components/demo/screens";
export default function Page() { return <Suspense fallback={<p role="status">Загружаем раздел…</p>}><DemoNotifications  /></Suspense>; }
