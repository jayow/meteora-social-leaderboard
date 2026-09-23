"use client";

import type { Trader } from "./types";
import { makeHistory } from "./pnl";

const K_USER = "meteora_user";
const K_ALL = "meteora_traders";

function read<T>(k: string, fb: T): T {
  if (typeof window === "undefined") return fb;
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fb;
  } catch {
    return fb;
  }
}
function write(k: string, v: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem(k, JSON.stringify(v));
}

function seeds(): Trader[] {
  return [
    {
      id: "1",
      username: "crypto_whale",
      displayName: "Crypto Whale",
      xHandle: "cryptowhale",
      xAvatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=cryptowhale",
      thesis: "Meteora USDC-SOL pools with high volume. Solana DeFi surge = alpha in stables.",
      portfolioValue: 125430.5,
      totalPnL: 15240.3,
      winRate: 68.24,
      avgWin: 555.59,
      biggestWin: 1824.21,
      avgLoss: -421.1,
      pnlHistory: makeHistory(90, 11),
    },
    {
      id: "2",
      username: "defi_hunter",
      displayName: "DeFi Hunter",
      xHandle: "defihunter",
      xAvatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=defihunter",
      thesis: "Farming across Meteora pools for 15–20% APY with low IL.",
      portfolioValue: 89200,
      totalPnL: 8940.15,
      winRate: 72.5,
      avgWin: 445.22,
      biggestWin: 1340.55,
      avgLoss: -310.88,
      pnlHistory: makeHistory(90, 22),
    },
    {
      id: "3",
      username: "sol_maxi",
      displayName: "SOL Maxi",
      xHandle: "solmaxi",
      xAvatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=solmaxi",
      thesis: "All-in Solana. Meteora is the best liquidity layer for SOL pairs.",
      portfolioValue: 210500.75,
      totalPnL: 32100.8,
      winRate: 65.3,
      avgWin: 890.33,
      biggestWin: 2540.9,
      avgLoss: -520.45,
      pnlHistory: makeHistory(90, 33),
    },
  ];
}

function me(): Trader {
  return {
    id: "me",
    username: "trader_anon",
    displayName: "Anonymous Trader",
    thesis: "Write your trading thesis here...",
    portfolioValue: 10470,
    totalPnL: 2980,
    winRate: 68.24,
    avgWin: 308.48,
    biggestWin: 555.59,
    avgLoss: -72.01,
    pnlHistory: makeHistory(90, 7),
  };
}

export function bootstrap(): Trader {
  let all = read<Trader[]>(K_ALL, []);
  if (!all.length) {
    all = seeds();
    write(K_ALL, all);
  }
  let user = read<Trader | null>(K_USER, null);
  if (!user) {
    user = me();
    write(K_USER, user);
  }
  write(K_ALL, [...all.filter((t) => t.id !== user!.id), user]);
  return user;
}

export function getMe(): Trader | null {
  return read<Trader | null>(K_USER, null);
}

export function listTraders(): Trader[] {
  return read<Trader[]>(K_ALL, []).sort((a, b) => b.totalPnL - a.totalPnL);
}

export function getTrader(id: string): Trader | null {
  if (id === "me") return getMe();
  return listTraders().find((t) => t.id === id) ?? null;
}

export function saveMe(user: Trader) {
  write(K_USER, user);
  write(K_ALL, [...listTraders().filter((t) => t.id !== user.id), user]);
}

export function setThesis(thesis: string) {
  const u = getMe();
  if (!u) return;
  u.thesis = thesis;
  saveMe(u);
}

export function linkX(handle: string, avatarUrl?: string, name?: string) {
  const u = getMe();
  if (!u) return;
  const h = handle.replace(/^@/, "").trim();
  u.xHandle = h;
  u.xAvatarUrl = avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(h)}`;
  if (u.displayName === "Anonymous Trader" && name) {
    u.displayName = name;
  } else if (u.displayName === "Anonymous Trader") {
    u.displayName = h;
  }
  saveMe(u);
}

export function unlinkX() {
  const u = getMe();
  if (!u) return;
  delete u.xHandle;
  delete u.xAvatarUrl;
  saveMe(u);
}

export function linkWallet(address: string) {
  const u = getMe();
  if (!u) return;
  u.walletAddress = address;
  saveMe(u);
}

export function unlinkWallet() {
  const u = getMe();
  if (!u) return;
  delete u.walletAddress;
  saveMe(u);
}
