"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { requestSignIn } from "@/lib/session-events";

type Gate = "loading" | "signed-out" | "not-member" | "member";

/**
 * Private-beta gate. Middleware shows this (same URL) to anyone who isn't a joined member, for
 * every page except sign-in / join / legal. Members who land here directly go to the app.
 */
export default function BetaGatePage() {
  const [gate, setGate] = useState<Gate>("loading");

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ userId: number | null; memberNumber?: number | null }>)
      .then((s) => setGate(!s.userId ? "signed-out" : s.memberNumber ? "member" : "not-member"))
      .catch(() => setGate("signed-out"));
  }, []);

  useEffect(() => {
    if (gate === "member" && window.location.pathname === "/beta") window.location.replace("/");
  }, [gate]);

  return (
    <main className="mx-auto max-w-[640px] px-4 py-16" data-testid="beta-gate">
      {gate === "not-member" ? (
        <EmptyState
          title="You're signed in, but not a member yet"
          action={
            <Link href="/join" className="btn-primary">
              Enter invite code
            </Link>
          }
        >
          Pool Party is in private beta. Join with an invite code from a member to see the leaderboard, pools and Poolside.
        </EmptyState>
      ) : gate === "signed-out" ? (
        <EmptyState
          title="Pool Party is in private beta"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/join" className="btn-primary">
                Sign up with invite
              </Link>
              <button type="button" onClick={() => requestSignIn()} className="btn-secondary">
                Sign in
              </button>
            </div>
          }
        >
          The social leaderboard for Meteora LPs. Members join with an invite code; already a member? Sign in.
        </EmptyState>
      ) : null}
    </main>
  );
}
