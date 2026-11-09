import { Suspense } from "react";
import { DemoContractors } from "@/components/demo/screens";
export default function Page() { return <Suspense fallback={<p role="status">Загружаем раздел…</p>}><DemoContractors detail /></Suspense>; }
