"use client";
import { useState } from "react";
import { useCallable } from "@/lib/useCallable";
import { Button, Notice, formatNumber } from "@/ui";
type Wallet = { balance: number; allowance: number | null; bonus: number | null; nextRefillAt: number | null; appUnlimited: boolean; floatingUnlimited: boolean;
  policy: { enabled: boolean; unlimited: boolean; amount: number; cycle: string; rollover: number } | null;
  history: { id: string; kind: string; delta: number; balance: number; at: number | null }[]; nextCursor: string | null };
export function TokenWalletPanel({ uid }: { uid: string }) {
  const [cursor, setCursor] = useState<string | null>(null);
  const q = useCallable<Wallet>("adminTokenWallet", { uid, cursor });
  const w = q.data;
  return <section className="mb-4 rounded-lg border border-line bg-panel p-4" aria-label="User token wallet">
    <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Token wallet & history</h2><Button onClick={q.reload}>Refresh wallet</Button></div>
    {q.error ? <Notice tone="danger">{q.error.message}</Notice> : null}
    {q.loading ? <p>Loading wallet…</p> : null}
    {w ? <><p>App: {w.appUnlimited ? "Unlimited" : `${formatNumber(w.balance)} tokens`} · Floating: {w.floatingUnlimited ? "Unlimited" : "Shared balance"}</p>
      {w.policy?.enabled && !w.policy.unlimited ? <p className="text-sm text-fg-muted">{formatNumber(w.policy.amount)} tokens {w.policy.cycle} · Allowance left {formatNumber(w.allowance)} · Bonus {formatNumber(w.bonus)} · Carry cap {formatNumber(w.policy.rollover)} · Next allowance review {w.nextRefillAt ? new Date(w.nextRefillAt).toLocaleString() : "—"}</p> : <p className="text-sm text-fg-muted">{w.policy?.enabled ? "Unlimited policy" : "Legacy token behavior"}</p>}
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Transaction</th><th>Change</th><th>Balance</th><th>Time</th></tr></thead><tbody>{w.history.map(h => <tr key={h.id} className="border-t border-line"><td className="py-2">{h.kind.replaceAll("_", " ")}</td><td>{h.delta > 0 ? "+" : ""}{formatNumber(h.delta)}</td><td>{formatNumber(h.balance)}</td><td>{h.at ? new Date(h.at).toLocaleString() : "Pending"}</td></tr>)}</tbody></table></div>
      {!w.history.length ? <p className="text-sm text-fg-muted">No transactions recorded.</p> : null}
      <div className="mt-2 flex gap-2">{cursor ? <Button onClick={() => setCursor(null)}>Newest</Button> : null}{w.nextCursor ? <Button onClick={() => setCursor(w.nextCursor)}>Older transactions</Button> : null}</div>
    </> : null}
  </section>;
}
