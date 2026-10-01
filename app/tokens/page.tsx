"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TokensPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/pools");
  }, [router]);

  return null;
}
