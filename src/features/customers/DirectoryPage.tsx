"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { callAdmin, type AdminApiError } from "@/lib/api";
import { useCan } from "@/lib/session";
import { Badge, Button, DataTable, ExportButton, Field, Icon, Notice, PageHeader, PlanBadge, Select, TextInput, formatNumber, relativeTime, type Column } from "@/ui";
import { formatMinor } from "../pricing/logic";
import type { DirectoryRow } from "./logic";
import styles from "./DirectoryPage.module.css";

interface ListResponse {
  rows: DirectoryRow[];
  nextCursor?: string | null;
  total?: number | null;
  piiVisible: boolean;
  directoryDetails?: boolean;
}
type Kind = "all" | "account" | "guest";
type AccountStatus = "all" | "enabled" | "disabled" | "unavailable";
const PAGE = 25;

export default function DirectoryPage() {
  const router = useRouter();
  const can = useCan();
  const [kind, setKind] = useState<Kind>("all");
  const [status, setStatus] = useState<AccountStatus>("all");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState<string | null>(null);
  const [rows, setRows] = useState<DirectoryRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [pii, setPii] = useState<boolean | null>(null);
  const [details, setDetails] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gen = useRef(0);

  const load = useCallback(async (k: Kind, s: AccountStatus, term: string | null = null) => {
    const mine = ++gen.current;
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setSearching(term);
    setRows([]);
    setCursor(null);
    setTotal(null);
    try {
      const res = await callAdmin<ListResponse>("adminUser", term
        ? { action: "search", query: term, kind: k, status: s, includeDetails: true }
        : { action: "list", kind: k, status: s, includeDetails: true, limit: PAGE });
      if (mine !== gen.current) return;
      setRows(res.rows);
      setCursor(res.nextCursor ?? null);
      setTotal(res.total ?? null);
      setPii(res.piiVisible);
      setDetails(res.directoryDetails === true);
    } catch (e) {
      if (mine === gen.current) setError((e as AdminApiError).message);
    } finally {
      if (mine === gen.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("all", "all");
    return () => { gen.current++; };
  }, [load]);

  const runSearch = () => {
    const term = query.trim();
    if (term.length >= 2) void load(kind, status, term);
  };
  const changeKind = (k: Kind) => { setKind(k); void load(k, status, searching); };
  const changeStatus = (s: AccountStatus) => { setStatus(s); void load(kind, s, searching); };

  async function loadMore() {
    if (!cursor || loadingMore || loading) return;
    const mine = gen.current;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await callAdmin<ListResponse>("adminUser", { action: "list", kind, status, includeDetails: true, limit: PAGE, cursor });
      if (mine !== gen.current) return;
      setRows((r) => [...r, ...res.rows.filter((x) => !r.some((y) => y.uid === x.uid))]);
      setCursor(res.nextCursor ?? null);
    } catch (e) {
      if (mine === gen.current) setError((e as AdminApiError).message);
    } finally {
      if (mine === gen.current) setLoadingMore(false);
    }
  }

  const open = (uid: string) => router.push(`/dashboard/users/view?uid=${encodeURIComponent(uid)}`);
  const columns: Column<DirectoryRow>[] = [
    {
      id: "user", header: "User", width: "23%",
      cell: (r) => <div className={styles.user}>
        <span className={styles.avatar} aria-hidden>{(r.displayName || r.email || (r.isGuest ? "G" : "U")).slice(0, 1).toUpperCase()}</span>
        <div className={styles.identity}>
          <p className="truncate font-semibold" title={r.displayName ?? undefined}>{r.displayName || (r.isGuest ? "Guest" : "No name")}</p>
          <p className="truncate text-xs text-fg-muted" title={r.email ?? r.uid}>{r.email ?? r.uid}</p>
          <p className="mt-1 text-xs text-fg-subtle">{r.isGuest ? "Guest" : "Account"} · Joined {relativeTime(r.createdAt)}</p>
        </div>
      </div>,
    },
    { id: "country", header: "Pricing country", cell: (r) => <span title="Saved pricing region; not the user's current location">{r.pricingCountry ?? "—"}</span> },
    { id: "plan", header: "Plan", cell: (r) => <div className={styles.plan}><PlanBadge plan={r.plan.planId} />{r.plan.source === "admin" ? <Badge tone="info">Granted</Badge> : null}</div> },
    { id: "status", header: "Status", cell: (r) => r.accountStatus === "enabled" ? <Badge tone="success">Enabled</Badge> : r.accountStatus === "disabled" ? <Badge tone="danger">Disabled</Badge> : <span className="text-xs text-fg-subtle">Unavailable</span> },
    { id: "tokens", header: "Tokens", align: "right", cell: (r) => <span title="Remaining stored token balance">{formatNumber(r.tokenBalance)}</span> },
    { id: "spend", header: "Spend", align: "right", cell: (r) => !can("billing.read") ? <span className="text-xs text-fg-subtle">Restricted</span> : !r.spend ? "—" : !r.spend.complete ? <span className="text-xs text-fg-subtle">Incomplete</span> : <div className={styles.spend}>{Object.entries(r.spend.totals).sort(([a], [b]) => a.localeCompare(b)).map(([c, v]) => <span key={c}>{formatMinor(v, c)} <small>{c}</small></span>)}</div> },
    { id: "lastSignIn", header: "Last sign-in", cell: (r) => <span className="whitespace-nowrap text-xs" title={r.lastSignInAt ? new Date(r.lastSignInAt).toLocaleString() : "No recorded sign-in"}>{relativeTime(r.lastSignInAt ?? null)}</span> },
    { id: "actions", header: "Actions", align: "right", cell: (r) => <Button variant="ghost" size="sm" icon="chevron-right" aria-label={`View details for ${r.displayName || r.uid}`} onClick={(e) => { e.stopPropagation(); open(r.uid); }}>View</Button> },
  ];

  return <div className={styles.page}>
    <PageHeader title="Users" description="Manage Akaya user accounts and subscriptions."
      actions={<div className="flex flex-wrap gap-2"><Button variant="ghost" icon="refresh" loading={loading} onClick={() => void load(kind, status, searching)}>Refresh</Button>{can("users.export") ? <ExportButton kind="users" what="users" /> : null}</div>} />
    <form className={styles.filters} onSubmit={(e) => { e.preventDefault(); runSearch(); }}>
      <Field label="Find a user" className={styles.searchField}>{(p) => <div className={styles.search}><Icon name="search" size={19} /><TextInput {...p} type="search" value={query} placeholder="Search UID, email or email prefix…" maxLength={200} onChange={(e) => setQuery(e.target.value)} /></div>}</Field>
      <Button type="submit" variant="secondary" disabled={query.trim().length < 2}>Search</Button>
      <Field label="Account type" className={styles.filter}>{(p) => <Select {...p} value={kind} onChange={(e) => changeKind(e.target.value as Kind)}><option value="all">All users</option><option value="account">Accounts</option><option value="guest">Guests</option></Select>}</Field>
      <Field label="Account status" className={styles.filter}>{(p) => <Select {...p} value={status} disabled={details !== true} onChange={(e) => changeStatus(e.target.value as AccountStatus)}><option value="all">All statuses</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option><option value="unavailable">Unavailable</option></Select>}</Field>
    </form>
    <div className={styles.context}>
      <p>{searching ? <>Results for <strong className="text-fg">{searching}</strong> <button className={styles.clear} onClick={() => { setQuery(""); void load(kind, status); }}>Clear search</button></> : <>Newest accounts first · {total == null ? "Total unavailable" : `${formatNumber(total)} users`}</>}</p>
      <p>Tokens: remaining balance · Spend: net recorded payments by currency</p>
    </div>
    {pii === false ? <Notice tone="info">Emails are partly hidden for your role. User details and exports follow the same permissions.</Notice> : null}
    {details === false ? <Notice tone="warning">This backend does not yet provide directory details. Country, status, spend and last sign-in are unavailable; status filtering is disabled.</Notice> : null}
    {status !== "all" ? <Notice tone="info">Status is checked against Firebase Auth, not subscription status. Each page scans {PAGE} accounts; Load more checks the next page.</Notice> : null}
    <p className={styles.scrollHint}>Swipe the table horizontally to see Tokens, Spend and Actions.</p>
    <div className={styles.table}>
      <DataTable label="Users" columns={columns} rows={rows} rowKey={(r) => r.uid} loading={loading} error={error}
        onRetry={() => rows.length && cursor ? void loadMore() : void load(kind, status, searching)}
        onRowClick={(r) => open(r.uid)} total={searching || status !== "all" ? null : total}
        hasMore={!searching && !!cursor} onLoadMore={() => void loadMore()} loadingMore={loadingMore}
        empty={{ title: searching ? "No user matches" : status !== "all" ? "No matching accounts in this page" : "No users found", body: searching ? "Search supports UID, full email and email prefix. Names are not searchable yet." : cursor ? "Use Load more to check the next page." : "Try another account type or status." }} />
    </div>
    <p className={styles.footnote}>Pricing country is a saved billing region. Last sign-in is Firebase authentication time, not app activity.{can("users.export") ? " CSV exports the newest 5,000 users with the existing export fields; table filters are not applied." : ""}</p>
  </div>;
}
