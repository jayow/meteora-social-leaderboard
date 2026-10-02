"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { CountrySelect } from "@/components/CountrySelect";
import { notifySessionChanged, requestSignIn } from "@/lib/session-events";
import { TermsCheckbox } from "@/components/TermsCheckbox";
import { TERMS_VERSION } from "@/lib/legal";

type Step = "code" | "wallet" | "x" | "country" | "thesis" | "complete" | "member";

interface JoinSession {
  userId: number | null;
  xHandle: string | null;
  memberNumber: number | null;
}

async function fetchJoinSession(): Promise<JoinSession> {
  try {
    const res = await fetch("/api/auth/session", { cache: "no-store" });
    const d = (await res.json()) as { userId?: number | null; xHandle?: string | null; memberNumber?: number | null };
    return { userId: d.userId ?? null, xHandle: d.xHandle ?? null, memberNumber: d.memberNumber ?? null };
  } catch {
    return { userId: null, xHandle: null, memberNumber: null };
  }
}

/** Where to go once the code is valid: signed-in users never re-sign or get a new account. */
function stepAfterCode(session: JoinSession): Step {
  if (session.memberNumber) return "member";
  if (!session.userId) return "wallet";
  return session.xHandle ? "country" : "x";
}

function JoinFlow() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [step, setStep] = useState<Step>("code");
  const [code, setCode] = useState(searchParams.get("code") || "");
  const [country, setCountry] = useState("");
  const [thesis, setThesis] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [memberNumber, setMemberNumber] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<JoinSession | null>(null);

  useEffect(() => {
    if (searchParams.get("code")) {
      setCode(searchParams.get("code") || "");
    }
  }, [searchParams]);

  // Know up front whether someone is already signed in (wallet or X) or already a member.
  useEffect(() => {
    let cancelled = false;
    void fetchJoinSession().then((s) => {
      if (cancelled) return;
      setSession(s);
      if (s.memberNumber) {
        setMemberNumber(s.memberNumber);
        setStep("member");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const checkCode = async (value: string): Promise<boolean> => {
    const res = await fetch("/api/join/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: value }),
    });
    const data = (await res.json()) as { valid: boolean; reason?: string };
    if (!data.valid) setError(data.reason || "Invalid code");
    return data.valid;
  };

  const validateCode = async () => {
    if (!code.trim()) {
      setError("Please enter an invite code");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (await checkCode(code.trim())) {
        const s = session ?? (await fetchJoinSession());
        setSession(s);
        if (s.memberNumber) setMemberNumber(s.memberNumber);
        setStep(stepAfterCode(s));
      }
    } catch {
      setError("Failed to validate code");
    } finally {
      setLoading(false);
    }
  };

  // Coming back from "Connect X" (returnTo=/join?code=...) or the Sign in modal (resume=1): resume.
  const xResult = searchParams.get("x");
  const resume = searchParams.get("resume") === "1";
  const resumedRef = useRef(false);
  useEffect(() => {
    const returnedCode = searchParams.get("code");
    if (!(xResult || resume) || !returnedCode || !session || resumedRef.current) return;
    resumedRef.current = true;
    if (session.memberNumber) return;
    void (async () => {
      setLoading(true);
      try {
        if (!(await checkCode(returnedCode.trim()))) return;
        if (xResult === "connected" && session.userId) {
          setStep("country");
        } else {
          setStep(stepAfterCode(session));
          if (xResult === "error") setError(searchParams.get("message") || "Couldn't connect X");
        }
      } catch {
        setError("Failed to validate code");
      } finally {
        setLoading(false);
      }
    })();
  }, [xResult, resume, searchParams, session]);

  // Signed-out users sign in through the app's Sign in modal (wallet picker or X), same as
  // everywhere else. The modal reloads the page on success, so keep the code in the URL and resume.
  const openSignIn = () => {
    const c = code.trim();
    if (c) window.history.replaceState(null, "", `/join?code=${encodeURIComponent(c)}&resume=1`);
    requestSignIn();
  };

  const skipX = () => {
    setStep("country");
  };

  const continueWithCountry = () => {
    setStep("thesis");
  };

  const finishJoin = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/join/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), country: country || null, thesis: thesis.trim() || null, termsVersion: termsAccepted ? TERMS_VERSION : null }),
      });
      const data = await res.json() as { ok?: boolean; user?: { memberNumber: number }; error?: string };
      if (!data.ok) {
        setError(data.error || "Failed to join");
      } else {
        setMemberNumber(data.user?.memberNumber || null);
        setStep("complete");
        // Header nav and profile switch to the member view right away.
        notifySessionChanged();
      }
    } catch {
      setError("Failed to join");
    } finally {
      setLoading(false);
    }
  };

  const shareOnX = () => {
    const text = `I'm #${memberNumber} in the Pool Party beta 🏖️ Party starts here`;
    const url = "https://lppool.party";
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank");
  };

  const errorLine = error ? <p role="alert" className="mt-3 text-base text-dn">{error}</p> : null;

  return (
    <main className="mx-auto max-w-[480px] px-4 pb-16 pt-10 sm:pt-16">
      <div className="card p-6 sm:p-8">
        {step !== "member" && step !== "complete" && (
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold tracking-tight">Join Pool Party</h1>
            <p className="mt-1 text-base text-mute">
              {step === "code"
                ? "Enter your invite code to join the beta."
                : step === "wallet"
                  ? "Sign in with your Solana wallet or X to continue."
                  : step === "x"
                    ? "Connect your X account (optional)."
                    : step === "country"
                      ? "Pick the country you rep on the leaderboard."
                      : "Last step: add a one-line thesis if you like."}
            </p>
          </div>
        )}

        {step === "code" && (
          <div>
            <label htmlFor="join-code" className="mb-1.5 block text-sm font-medium text-mute">
              Invite code
            </label>
            <input
              id="join-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="XXXXXXXX"
              autoComplete="off"
              spellCheck={false}
              className="field num h-11 text-md font-semibold"
              maxLength={8}
            />
            {errorLine}
            <button type="button" onClick={validateCode} disabled={loading} className="btn-primary mt-4 h-11 w-full">
              {loading ? "Validating…" : "Continue"}
            </button>
          </div>
        )}

        {step === "wallet" && (
          <div>
            {errorLine}
            <button type="button" onClick={openSignIn} disabled={loading} className="btn-primary h-11 w-full">
              Sign in
            </button>
          </div>
        )}

        {step === "x" && (
          <div className="space-y-2">
            <a
              href={`/api/x/login?termsVersion=${encodeURIComponent(TERMS_VERSION)}&returnTo=${encodeURIComponent(`/join?code=${code.trim()}`)}`}
              className="btn-primary h-11 w-full"
            >
              Connect X
            </a>
            <button type="button" onClick={skipX} className="btn-ghost h-11 w-full">
              Skip
            </button>
          </div>
        )}

        {step === "country" && (
          <div>
            <span className="mb-1.5 block text-sm font-medium text-mute">Country (optional)</span>
            <CountrySelect value={country} onChange={setCountry} className="h-11 w-full" />
            {errorLine}
            <button type="button" onClick={continueWithCountry} className="btn-primary mt-4 h-11 w-full">
              Continue
            </button>
          </div>
        )}

        {step === "thesis" && (
          <div>
            <label htmlFor="join-thesis" className="mb-1.5 block text-sm font-medium text-mute">
              One-line thesis (optional)
            </label>
            <input
              id="join-thesis"
              type="text"
              value={thesis}
              onChange={(e) => setThesis(e.target.value)}
              placeholder="Your trading philosophy…"
              className="field h-11"
              maxLength={200}
            />
            <div className="tile mt-4 p-3">
              <TermsCheckbox checked={termsAccepted} onChange={setTermsAccepted} id="join-terms-consent" />
            </div>
            {errorLine}
            <button type="button" onClick={finishJoin} disabled={loading || !termsAccepted} className="btn-primary mt-4 h-11 w-full">
              {loading ? "Joining…" : "Join Pool Party"}
            </button>
          </div>
        )}

        {step === "member" && (
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-fg">
              You&apos;re already in{memberNumber ? <span className="num"> (#{memberNumber})</span> : null}
            </h1>
            <p className="mt-1 text-base text-mute">This account has already joined the Pool Party beta.</p>
            <Link href="/profile/me" className="btn-primary mt-6 h-11 w-full">
              Go to your profile
            </Link>
          </div>
        )}

        {step === "complete" && (
          <div className="text-center">
            <h1 className="num text-3xl font-bold tracking-tight text-fg">You&apos;re #{memberNumber}</h1>
            <p className="mt-1 text-md text-fg-secondary">of 500 in the Pool Party beta</p>
            <div className="mt-6 space-y-2">
              <button type="button" onClick={shareOnX} className="btn-primary h-11 w-full">
                Share on X
              </button>
              <button type="button" onClick={() => router.push("/")} className="btn-secondary h-11 w-full">
                Go to leaderboard
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-[480px] px-4 pb-16 pt-10 sm:pt-16">
          <div className="card p-6 sm:p-8" aria-busy="true">
            <span className="skeleton mx-auto block h-7 w-48" />
            <span className="skeleton mx-auto mt-2 block h-4 w-64 max-w-full" />
            <span className="skeleton mt-6 block h-11 w-full" />
            <span className="skeleton mt-4 block h-11 w-full rounded-full" />
          </div>
        </main>
      }
    >
      <JoinFlow />
    </Suspense>
  );
}
