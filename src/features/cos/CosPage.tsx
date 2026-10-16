"use client";

import { useEffect, useState } from "react";
import { Badge, ErrorState, PageHeader, PermissionDenied, Skeleton, Tabs, type TabDef } from "@/ui";
import { CosProvider, useCosCtx } from "./CosContext";
import { DraftBar } from "./DraftBar";
import { OverviewTab } from "./OverviewTab";
import { PersonalityTab } from "./PersonalityTab";
import { ChannelsTab } from "./ChannelsTab";
import { IntentsTab } from "./IntentsTab";
import { LanguagesTab } from "./LanguagesTab";
import { ModelsTab } from "./ModelsTab";
import { QualityTab } from "./QualityTab";
import { ExperimentsTab } from "./ExperimentsTab";
import { PlaygroundTab } from "./PlaygroundTab";
import { VersionsTab } from "./VersionsTab";
import { TelemetryTab } from "./TelemetryTab";

const TABS: TabDef[] = [
  { id: "overview", label: "Overview" },
  { id: "personality", label: "Personality" },
  { id: "channels", label: "Channels" },
  { id: "intents", label: "Intents" },
  { id: "languages", label: "Languages" },
  { id: "models", label: "Models" },
  { id: "quality", label: "Quality gate" },
  { id: "experiments", label: "Experiments" },
  { id: "playground", label: "Playground" },
  { id: "versions", label: "Versions" },
  { id: "telemetry", label: "Telemetry" },
];
/// Tabs that edit the DRAFT (the draft bar is shown on these only).
const DRAFT_TABS = new Set(["overview", "personality", "channels", "intents", "languages", "quality", "playground"]);

function readHash(): string {
  if (typeof window === "undefined") return "overview";
  const h = window.location.hash.replace(/^#/, "");
  return TABS.some((t) => t.id === h) ? h : "overview";
}

function Body() {
  const c = useCosCtx();
  const [tab, setTab] = useState("overview");
  useEffect(() => {
    setTab(readHash());
    const on = () => setTab(readHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const choose = (id: string) => {
    setTab(id);
    try {
      window.history.replaceState(null, "", `#${id}`);
    } catch {
      /* hash is a convenience only */
    }
  };

  if (!c.access.canView) return <PermissionDenied permission="cos.read" />;

  return (
    <>
      <PageHeader
        title="Conversation OS"
        description="One identity across every channel and model: personality, channel and intent behaviour, languages, model profiles, quality gate and experiments. Edit a draft, preview it in the Playground, then publish."
        meta={
          c.q.data ? (
            <>
              <Badge tone={c.q.data.published.config.enabled ? "success" : "neutral"}>OS {c.q.data.published.config.enabled ? "on" : "off"}</Badge>
              <Badge tone="neutral">Published v{c.q.data.published.metaVersion}</Badge>
              {c.q.data.draft ? <Badge tone="info">Draft v{c.q.data.draft.version}</Badge> : null}
            </>
          ) : null
        }
      />
      {c.q.loading && !c.q.data ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading Conversation OS">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : c.q.error && !c.q.data ? (
        <ErrorState message={c.q.error.message} onRetry={c.q.reload} />
      ) : (
        <>
          <Tabs tabs={TABS} value={tab} onChange={choose} label="Conversation OS sections" />
          <div className="mt-4" role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {DRAFT_TABS.has(tab) ? <DraftBar /> : null}
            {tab === "overview" ? <OverviewTab /> : null}
            {tab === "personality" ? <PersonalityTab /> : null}
            {tab === "channels" ? <ChannelsTab /> : null}
            {tab === "intents" ? <IntentsTab /> : null}
            {tab === "languages" ? <LanguagesTab /> : null}
            {tab === "models" ? <ModelsTab /> : null}
            {tab === "quality" ? <QualityTab /> : null}
            {tab === "experiments" ? <ExperimentsTab /> : null}
            {tab === "playground" ? <PlaygroundTab /> : null}
            {tab === "versions" ? <VersionsTab /> : null}
            {tab === "telemetry" ? <TelemetryTab /> : null}
          </div>
        </>
      )}
    </>
  );
}

export default function CosPage() {
  return (
    <CosProvider>
      <Body />
    </CosProvider>
  );
}
