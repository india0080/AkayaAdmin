// Console information architecture — the approved master structure.
//
// PURE DATA + PURE FUNCTIONS (no React, no Firebase) so the model is
// unit-tested under node --test.
//
// Each route declares the permission needed to SEE it. That is navigation,
// not security: the callables and firestore.rules enforce access. A route
// the admin cannot see renders <PermissionDenied/> if opened directly.

import type { Permission } from "../lib/permissions";

export type IconName =
  | "home" | "bell-alert" | "users" | "receipt" | "sparkles" | "mic" | "sliders"
  | "lifebuoy" | "megaphone" | "chart" | "server" | "shield" | "grid" | "activity"
  | "card" | "cpu" | "route" | "brain" | "puzzle" | "wrench" | "smile" | "masks"
  | "download" | "bubble" | "layers" | "flag" | "inbox" | "flag-alert" | "bell"
  | "heart-pulse" | "key" | "scroll" | "user-cog" | "x-circle";

export interface NavRoute {
  /// Path WITHOUT the /Admin basePath.
  href: string;
  label: string;
  icon: IconName;
  permission: Permission;
  legacy?: boolean;
  /// Hide from sidebar and command palette until the backend is ready.
  hidden?: boolean;
  /// Extra words the command palette matches on.
  keywords?: string[];
}

export interface NavGroup {
  id: string;
  label: string;
  icon: IconName;
  routes: NavRoute[];
}

export const NAV: NavGroup[] = [
  {
    id: "command",
    label: "Command Center",
    icon: "home",
    routes: [
      { href: "/dashboard", label: "Overview", icon: "grid", permission: "dashboard.read",
        keywords: ["home", "kpi", "summary", "attention", "alerts"] },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    icon: "users",
    routes: [
      { href: "/dashboard/users", label: "User Directory", icon: "users", permission: "users.read",
        keywords: ["user", "email", "uid", "plan", "account", "user 360", "lookup", "customer"] },
      { href: "/dashboard/erasure", label: "Account Erasure", icon: "x-circle", permission: "users.erasure",
        keywords: ["delete", "dpdp", "gdpr", "erasure", "deleted account"] },
      { href: "/dashboard/bulk", label: "Bulk Operations", icon: "users", permission: "users.modify",
        keywords: ["batch", "bulk plan", "bulk grant", "mass update"] },
    ],
  },
  {
    id: "revenue",
    label: "Revenue",
    icon: "receipt",
    routes: [
      { href: "/dashboard/subscriptions", label: "Subscriptions", icon: "card", permission: "billing.read",
        keywords: ["subscribers", "plans", "expiring", "lapsed", "renewal"] },
      { href: "/dashboard/payments", label: "Payments", icon: "receipt", permission: "billing.read",
        keywords: ["ledger", "razorpay", "refund", "webhook", "reconcile", "captured"] },
      { href: "/dashboard/plans", label: "Plans & Pricing", icon: "sliders", permission: "plans.read",
        keywords: ["price", "pricing", "silver", "gold", "annual"] },
      { href: "/dashboard/pricing", label: "Country Pricing", icon: "card", permission: "plans.read",
        keywords: ["country", "currency", "usd", "cad", "inr", "region", "international", "multi-currency"] },
      { href: "/dashboard/revenue", label: "Revenue Insights", icon: "chart", permission: "billing.read",
        keywords: ["mrr", "arr", "estimated", "actual", "revenue"] },
    ],
  },
  {
    id: "ai",
    label: "AI Platform",
    icon: "sparkles",
    routes: [
      { href: "/dashboard/providers", label: "Providers & Keys", icon: "key", permission: "ai.providers.read",
        keywords: ["groq", "openai", "sarvam", "api key", "secret", "openrouter key", "huggingface", "gateway"] },
      { href: "/dashboard/openrouter", label: "Cloud Model Catalog", icon: "cpu", permission: "ai.models.read",
        keywords: ["models", "openrouter", "catalog", "tier", "disable model"] },
      { href: "/dashboard/model-inventory", label: "Model Health", icon: "heart-pulse", permission: "ai.models.read",
        keywords: ["health", "circuit", "latency", "fallback chains", "inventory"] },
      { href: "/dashboard/routing", label: "Routing & Fallbacks", icon: "route", permission: "ai.routing.read",
        keywords: ["model routing", "fallback", "task class", "vision floor"] },
      { href: "/dashboard/ai-usage", label: "AI Usage & Cost", icon: "chart", permission: "ai.usage.read",
        keywords: ["cost", "tokens", "requests", "telemetry", "finops", "spend"] },
      { href: "/dashboard/intelligence", label: "Intelligence", icon: "brain", permission: "ai.behaviour.read",
        keywords: ["intent", "planner", "validator", "smart reply"] },
      { href: "/dashboard/skills", label: "Skills", icon: "puzzle", permission: "ai.behaviour.read",
        keywords: ["skill prompt", "override"] },
      { href: "/dashboard/tools", label: "Tools", icon: "wrench", permission: "ai.behaviour.read",
        keywords: ["disabled tools", "kill tool", "calculator", "web search tool"] },
      { href: "/dashboard/personality", label: "Personality", icon: "smile", permission: "ai.behaviour.read",
        keywords: ["system prompt", "greeting"] },
      { href: "/dashboard/personas", label: "Personas", icon: "masks", permission: "ai.behaviour.read",
        keywords: ["persona", "friend", "mentor", "romantic", "pro", "fun", "listener", "dost"] },
      { href: "/dashboard/models", label: "On-device Models", icon: "download", permission: "ai.models.read",
        keywords: ["offline", "gemma", "qwen", "ram", "custom", "voice", "recommendations"] },
      { href: "/dashboard/playground", label: "AI Playground", icon: "sparkles", permission: "ai.behaviour.configure",
        hidden: true, keywords: ["test", "prompt", "sandbox", "try", "experiment"] },
    ],
  },
  {
    id: "cos",
    label: "Conversation OS",
    icon: "brain",
    routes: [
      { href: "/dashboard/conversation-os", label: "Conversation OS", icon: "brain", permission: "cos.read",
        keywords: ["personality", "tone", "traits", "channels", "intents", "languages", "hinglish", "model profiles", "quality gate", "repair",
          "experiments", "a/b", "playground", "rollout", "draft", "publish", "rollback", "forbidden phrases", "identity"] },
    ],
  },
  {
    id: "voice",
    label: "Voice & Floating",
    icon: "mic",
    routes: [
      { href: "/dashboard/voice", label: "Voice", icon: "mic", permission: "voice.read",
        keywords: ["stt", "tts", "realtime", "voice packages", "barge-in", "insert polish", "voice quota"] },
      { href: "/dashboard/floating-system", label: "Floating Control Plane", icon: "layers", permission: "floating.read",
        keywords: ["floating system", "dictation", "pipeline", "version", "rollback"] },
      { href: "/dashboard/floating-assistant", label: "Floating Overlay", icon: "bubble", permission: "floating.read",
        keywords: ["bubble", "quick actions", "radial menu", "kill switch", "blocked apps"] },
    ],
  },
  {
    id: "config",
    label: "Product Config",
    icon: "sliders",
    routes: [
      { href: "/dashboard/control-matrix", label: "Control Matrix", icon: "sliders", permission: "config.read",
        keywords: ["identity", "localization", "central configuration", "system controls"] },
      { href: "/dashboard/flags", label: "Feature Flags & Kill Switches", icon: "flag", permission: "flags.read",
        keywords: ["feature flag", "kill switch", "toggle", "rollout", "app check", "planner", "voice enabled"] },
      { href: "/dashboard/web-management", label: "Web & CMS", icon: "grid", permission: "config.read", keywords: ["content", "offers", "marketing", "a/b"] },
      { href: "/dashboard/config", label: "App Config", icon: "sliders", permission: "config.read",
        keywords: ["maintenance", "force update", "announcement", "limits"] },
      { href: "/dashboard/future", label: "Future", icon: "sparkles", permission: "config.read",
        keywords: ["coming soon", "placeholder", "popup", "sidebar rows", "beta", "teaser", "future message"] },
      { href: "/dashboard/capabilities", label: "Capabilities", icon: "layers", permission: "config.read",
        keywords: ["what can you do", "capability", "coming soon", "status", "override", "hindi", "hinglish", "answer"] },
      { href: "/dashboard/chat", label: "Chat Limits", icon: "chart", permission: "config.read",
        keywords: ["chat analytics", "rate limits", "message cap", "quota"] },
      { href: "/dashboard/config-history", label: "Config History", icon: "scroll", permission: "config.read",
        keywords: ["rollback", "undo", "versions", "changelog"] },
      { href: "/dashboard/settings", label: "Console Settings", icon: "sliders", permission: "config.read",
        keywords: ["timezone", "density", "notifications", "preferences"] },
      { href: "/dashboard/changelog", label: "Changelog", icon: "scroll", permission: "config.read",
        hidden: true, keywords: ["release notes", "version history", "deployed", "shipped"] },
    ],
  },
  {
    id: "support",
    label: "Support & Trust",
    icon: "lifebuoy",
    routes: [
      { href: "/dashboard/tickets", label: "Support", icon: "lifebuoy", permission: "support.read",
        keywords: ["tickets", "support", "help", "queue", "ticket", "helpdesk", "reply"] },
      { href: "/dashboard/inbox", label: "Inbox", icon: "inbox", permission: "support.read",
        keywords: ["contact", "affiliate", "applications"] },
      { href: "/dashboard/moderation", label: "Moderation", icon: "flag-alert", permission: "support.read",
        keywords: ["reports", "flagged"] },
      { href: "/dashboard/chat-monitor", label: "Chat Monitor", icon: "activity", permission: "support.read",
        keywords: ["live monitor", "sessions", "broadcast", "chat control"] },
      { href: "/dashboard/compliance", label: "Compliance", icon: "shield", permission: "security.read",
        keywords: ["dpdp", "privacy", "data protection", "consent", "regulation"] },
    ],
  },
  {
    id: "comms",
    label: "Communications",
    icon: "megaphone",
    routes: [
      { href: "/dashboard/notifications", label: "Push Notifications", icon: "bell", permission: "comms.send",
        keywords: ["push", "fcm", "broadcast"] },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: "chart",
    routes: [
      { href: "/dashboard/activity", label: "Acquisition & Activity", icon: "activity", permission: "analytics.read",
        keywords: ["signups", "growth"] },
      { href: "/dashboard/retention", label: "Retention", icon: "heart-pulse", permission: "analytics.read", keywords: ["win-back", "churn", "recovery"] },
      { href: "/dashboard/exports", label: "Reports & Exports", icon: "download", permission: "audit.read",
        keywords: ["export", "csv", "report", "download", "scheduled"] },
    ],
  },
  {
    id: "system",
    label: "System",
    icon: "server",
    routes: [
      { href: "/dashboard/health", label: "Service Health", icon: "heart-pulse", permission: "system.read",
        keywords: ["status", "secrets", "probe"] },
      { href: "/dashboard/setup", label: "Setup Wizard", icon: "sparkles", permission: "config.modify",
        keywords: ["onboarding", "initial", "configure", "wizard", "deploy"] },
    ],
  },
  {
    id: "security",
    label: "Security & Admin",
    icon: "shield",
    routes: [
      { href: "/dashboard/admins", label: "Admins & Roles", icon: "user-cog", permission: "admins.manage",
        keywords: ["iam", "rbac", "permissions", "grant", "revoke", "suspend"] },
      { href: "/dashboard/audit", label: "Audit Log", icon: "scroll", permission: "audit.read",
        keywords: ["history", "who changed", "activity log", "compliance"] },
    ],
  },
];

// ── Pure model functions ────────────────────────────────────────────────────

type Can = (p: Permission) => boolean;

/// Groups and routes the admin may see; groups with no visible route vanish.
export function visibleNav(can: Can, nav: NavGroup[] = NAV): NavGroup[] {
  return nav
    .map((g) => ({ ...g, routes: g.routes.filter((r) => !r.hidden && can(r.permission)) }))
    .filter((g) => g.routes.length > 0);
}

function normalise(path: string): string {
  const p = path.replace(/^\/Admin(?=\/|$)/, "").replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

/// The route a pathname belongs to: exact match first, else the longest
/// route that is a path-prefix (so /dashboard/users/detail → User Lookup).
/// "/dashboard" only ever matches exactly — it would otherwise swallow all.
export function findRoute(
  pathname: string,
  nav: NavGroup[] = NAV,
): { group: NavGroup; route: NavRoute } | null {
  const path = normalise(pathname);
  let best: { group: NavGroup; route: NavRoute } | null = null;
  for (const group of nav) {
    for (const route of group.routes) {
      if (route.href === path) return { group, route };
      if (route.href !== "/dashboard" && path.startsWith(route.href + "/")) {
        if (!best || route.href.length > best.route.href.length) best = { group, route };
      }
    }
  }
  return best;
}

export interface Crumb {
  label: string;
  href?: string;
}

export function breadcrumbs(pathname: string, nav: NavGroup[] = NAV): Crumb[] {
  const hit = findRoute(pathname, nav);
  if (!hit) return [{ label: "Console" }];
  return [{ label: hit.group.label }, { label: hit.route.label, href: hit.route.href }];
}

export interface SearchHit {
  route: NavRoute;
  group: NavGroup;
  score: number;
}

/// Command-palette matching: every query word must appear in the route's
/// label, group or keywords. Label-prefix hits rank first.
export function searchNav(query: string, nav: NavGroup[]): SearchHit[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const hits: SearchHit[] = [];
  for (const group of nav) {
    for (const route of group.routes) {
      if (route.hidden) continue;
      const label = route.label.toLowerCase();
      const hay = [label, group.label.toLowerCase(), ...(route.keywords ?? [])].join(" ");
      if (words.length === 0) {
        hits.push({ route, group, score: 0 });
        continue;
      }
      if (!words.every((w) => hay.includes(w))) continue;
      let score = 1;
      if (label.startsWith(words[0])) score += 4;
      else if (label.includes(words[0])) score += 2;
      if (group.label.toLowerCase().startsWith(words[0])) score += 1;
      hits.push({ route, group, score });
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.route.label.localeCompare(b.route.label));
}
