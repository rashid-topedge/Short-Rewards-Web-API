import { Suspense } from "react";

import { Catalog } from "@/components/Catalog";

export default function Home() {
  return (
    <Suspense fallback={<p className="px-6 py-8 text-sm text-zinc-500">Loading catalog…</p>}>
      <Catalog />
    </Suspense>
  );
}
