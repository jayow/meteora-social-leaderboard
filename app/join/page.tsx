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
    const url = "https://web-production-c8f29.up.railway.app";
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank");
  };

  return (
    <main className="mx-auto max-w-[600px] px-4 py-20">
      <div className="glass rounded-3xl p-8">
        <h1 className="mb-6 text-center text-3xl font-bold">Join Pool Party</h1>

        {step === "code" && (
          <div>
            <label className="mb-2 block text-sm font-medium text-mute">Invite Code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="XXXXXXXX"
              className="mb-4 w-full rounded-xl border border-border bg-surface-raised px-4 py-3 font-semibold uppercase"
              maxLength={8}
            />
            {error && <p className="mb-4 text-sm text-dn">{error}</p>}
            <button onClick={validateCode} disabled={loading} className="btn-primary w-full py-3">
              {loading ? "Validating..." : "Continue"}
            </button>
          </div>
        )}

        {step === "wallet" && (
          <div>
            <p className="mb-4 text-center">Sign in with your Solana wallet or X to continue</p>
            {error && <p className="mb-4 text-sm text-dn">{error}</p>}
            <button type="button" onClick={openSignIn} disabled={loading} className="btn-primary w-full py-3">
              Sign in
            </button>
          </div>
        )}

        {step === "x" && (
          <div>
            <p className="mb-4 text-center">Connect your X account (optional)</p>
            <a href={`/api/x/login?termsVersion=${encodeURIComponent(TERMS_VERSION)}&returnTo=${encodeURIComponent(`/join?code=${code.trim()}`)}`} className="btn-primary mb-4 flex w-full py-3">
              Connect X
            </a>
            <button onClick={skipX} className="w-full text-sm text-mute hover:text-fg">
              Skip
            </button>
          </div>
        )}

        {step === "country" && (
          <div>
            <label className="mb-2 block text-sm font-medium text-mute">Country (optional)</label>
            <CountrySelect value={country} onChange={setCountry} />
            {error && <p className="mb-4 text-sm text-dn">{error}</p>}
            <button onClick={continueWithCountry} className="btn-primary mt-4 w-full py-3">
              Continue
            </button>
          </div>
        )}

        {step === "thesis" && (
          <div>
            <label className="mb-2 block text-sm font-medium text-mute">One-line thesis (optional)</label>
            <input
              type="text"
              value={thesis}
              onChange={(e) => setThesis(e.target.value)}
              placeholder="Your trading philosophy..."
              className="mb-4 w-full rounded-xl border border-border bg-surface-raised px-4 py-3"
              maxLength={200}
            />
            <div className="mb-4 rounded-2xl border border-border bg-surface-raised p-3">
              <TermsCheckbox checked={termsAccepted} onChange={setTermsAccepted} id="join-terms-consent" />
            </div>
            {error && <p className="mb-4 text-sm text-dn">{error}</p>}
            <button onClick={finishJoin} disabled={loading || !termsAccepted} className="btn-primary w-full py-3">
              {loading ? "Joining..." : "Join Pool Party"}
            </button>
          </div>
        )}

        {step === "member" && (
          <div className="text-center">
            <h2 className="mb-2 text-3xl font-bold text-fg">You&apos;re already in{memberNumber ? ` (#${memberNumber})` : ""}</h2>
            <p className="mb-6 text-mute">This account has already joined the Pool Party beta.</p>
            <Link href="/profile/me" className="btn-primary flex w-full py-3">
              Go to your profile
            </Link>
          </div>
        )}

        {step === "complete" && (
          <div className="text-center">
            <h2 className="mb-4 text-4xl font-bold text-fg">You&apos;re #{memberNumber}</h2>
            <p className="mb-6 text-lg">of 500 in the Pool Party beta 🎉</p>
            <button onClick={shareOnX} className="btn-primary mb-4 w-full py-3">
              Share on X
            </button>
            <button onClick={() => router.push("/")} className="w-full rounded-full border border-border py-3 font-semibold hover:bg-surface-raised">
              Go to Leaderboard
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-[600px] px-4 py-20"><p className="text-center text-mute">Loading...</p></main>}>
      <JoinFlow />
    </Suspense>
  );
}
