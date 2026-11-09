import { Suspense } from 'react';
import { DemoOrderPage } from '@/components/demo/screens';
export default function Page() { return <Suspense fallback={<p>Открываем заказ…</p>}><DemoOrderPage /></Suspense>; }
