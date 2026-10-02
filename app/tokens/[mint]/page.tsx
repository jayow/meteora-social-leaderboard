"use client";

import { Suspense, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function TokenPage() {
  return (
    <Suspense fallback={null}>
      <TokenDetail />
    </Suspense>
  );
}

function TokenDetail() {
  const params = useParams<{ mint: string }>();
  const router = useRouter();
  const mint = decodeURIComponent(params.mint);

  useEffect(() => {
    router.replace(`/pools?token=${encodeURIComponent(mint)}`);
  }, [mint, router]);

  return null;
}

