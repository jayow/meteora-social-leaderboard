/** The exact message the client asks the wallet to sign (shared by client and server). */
export function loginMessage(wallet: string, issuedAt: string): string {
  return `Pool Party wants you to verify you own this wallet.\n\nWallet: ${wallet}\nIssued at: ${issuedAt}\n\nThis signature is free and does not send a transaction.`;
}
