"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { loginMessage } from "@/lib/login-message";
import { CountrySelect } from "@/components/CountrySelect";

type Step = "code" | "wallet" | "x" | "country" | "thesis" | "complete";

function JoinFlow() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { publicKey, signMessage } = useWallet();
  const { setVisible } = useWalletModal();
  const [step, setStep] = useState<Step>("code");
  const [code, setCode] = useState(searchParams.get("code") || "");
  const [country, setCountry] = useState("");
  const [thesis, setThesis] = useState("");
  const [memberNumber, setMemberNumber] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get("code")) {
      setCode(searchParams.get("code") || "");
    }
  }, [searchParams]);

  const validateCode = async () => {
    if (!code.trim()) {
      setError("Please enter an invite code");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/join/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json() as { valid: boolean; reason?: string };
      if (!data.valid) {
        setError(data.reason || "Invalid code");
      } else {
        setStep("wallet");
      }
    } catch {
      setError("Failed to validate code");
    } finally {
      setLoading(false);
    }
  };

  const connectAndSign = async () => {
    if (!publicKey || !signMessage) {
      setVisible(true);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const wallet = publicKey.toBase58();
      const issuedAt = new Date().toISOString();
      const message = loginMessage(wallet, issuedAt);
      const signature = Buffer.from(await signMessage(Buffer.from(message, "utf8"))).toString("base64");

      const authRes = await fetch("/api/auth/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet, issuedAt, signature }),
      });

      if (!authRes.ok) {
        const data = await authRes.json() as { error?: string };
        setError(data.error || "Authentication failed");
        setLoading(false);
        return;
      }

      setStep("x");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign");
    } finally {
      setLoading(false);
    }
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
        body: JSON.stringify({ code: code.trim(), country: country || null, thesis: thesis.trim() || null }),
      });
      const data = await res.json() as { ok?: boolean; user?: { memberNumber: number }; error?: string };
      if (!data.ok) {
        setError(data.error || "Failed to join");
      } else {
        setMemberNumber(data.user?.memberNumber || null);
        setStep("complete");
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
              className="mb-4 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-semibold uppercase"
              maxLength={8}
            />
            {error && <p className="mb-4 text-sm text-dn">{error}</p>}
            <button onClick={validateCode} disabled={loading} className="brand-grad w-full rounded-full py-3 font-bold">
              {loading ? "Validating..." : "Continue"}
            </button>
          </div>
        )}

        {step === "wallet" && (
          <div>
            <p className="mb-4 text-center">Connect your Solana wallet and sign to continue</p>
            {error && <p className="mb-4 text-sm text-dn">{error}</p>}
            <button onClick={connectAndSign} disabled={loading} className="brand-grad w-full rounded-full py-3 font-bold">
              {loading ? "Signing..." : publicKey ? "Sign Message" : "Connect Wallet"}
            </button>
          </div>
        )}

        {step === "x" && (
          <div>
            <p className="mb-4 text-center">Connect your X account (optional)</p>
            <a href="/api/x/login" className="brand-grad mb-4 block w-full rounded-full py-3 text-center font-bold">
              Connect X
            </a>
            <button onClick={skipX} className="w-full text-sm text-mute hover:text-white">
              Skip
            </button>
          </div>
        )}

        {step === "country" && (
          <div>
            <label className="mb-2 block text-sm font-medium text-mute">Country (optional)</label>
            <CountrySelect value={country} onChange={setCountry} />
            {error && <p className="mb-4 text-sm text-dn">{error}</p>}
            <button onClick={continueWithCountry} className="brand-grad mt-4 w-full rounded-full py-3 font-bold">
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
              className="mb-4 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3"
              maxLength={200}
            />
            {error && <p className="mb-4 text-sm text-dn">{error}</p>}
            <button onClick={finishJoin} disabled={loading} className="brand-grad w-full rounded-full py-3 font-bold">
              {loading ? "Joining..." : "Join Pool Party"}
            </button>
          </div>
        )}

        {step === "complete" && (
          <div className="text-center">
            <h2 className="mb-4 text-4xl font-bold text-orange">You&apos;re #{memberNumber}</h2>
            <p className="mb-6 text-lg">of 500 in the Pool Party beta 🎉</p>
            <button onClick={shareOnX} className="brand-grad mb-4 w-full rounded-full py-3 font-bold">
              Share on X
            </button>
            <button onClick={() => router.push("/")} className="w-full rounded-full border border-white/10 py-3 font-semibold hover:bg-white/5">
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
