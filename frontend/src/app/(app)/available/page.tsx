import { Suspense } from "react";
import { DemoOrders } from "@/components/demo/screens";
export default function Page() { return <Suspense fallback={<p role="status">Загружаем раздел…</p>}><DemoOrders mode="available" /></Suspense>; }
