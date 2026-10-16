"use client";

import { useState } from "react";
import { callAdmin } from "@/lib/api";
import { useCan } from "@/lib/session";
import { useCallable } from "@/lib/useCallable";
import {
  Badge, Button, DataTable, ErrorState, Field, Notice, PageHeader,
  Panel, Select, Skeleton, TextInput, Textarea, relativeTime, useToast,
  type Column, type Tone,
} from "@/ui";

// ── Types ──────────────────────────────────────────────────────────────

interface ReleaseEntry {
  id: string;
  version: string;
  date: string;
  description: string;
  severity: "major" | "minor" | "patch";
  publishedBy: string;
  publishedAt: number | null;
}

const SEVERITY_TONE: Record<string, Tone> = {
  major: "danger",
  minor: "info",
  patch: "neutral",
};

// ── Component ──────────────────────────────────────────────────────────

export default function ChangelogPage() {
  const can = useCan();
  const canWrite = can("config.modify");
  const toast = useToast();

  // Form state
  const [version, setVersion] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<"major" | "minor" | "patch">("patch");
  const [publishing, setPublishing] = useState(false);

  // Data
  const q = useCallable<{ entries: ReleaseEntry[] }>("adminChangelog", {
    action: "list",
  });

  async function publish() {
    if (!version.trim() || !description.trim()) {
      toast.error("Version and description are required.");
      return;
    }
    setPublishing(true);
    try {
      await callAdmin("adminChangelog", {
        action: "publish",
        version: version.trim(),
        date: date || new Date().toISOString().slice(0, 10),
        description: description.trim(),
        severity,
      });
      toast.success(`Published release ${version.trim()}.`);
      setVersion("");
      setDate("");
      setDescription("");
      setSeverity("patch");
      q.reload();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setPublishing(false);
    }
  }

  const cols: Column<ReleaseEntry>[] = [
    {
      id: "version",
      header: "Version",
      width: "120px",
      cell: (r) => <Badge tone={SEVERITY_TONE[r.severity]}>{r.version}</Badge>,
    },
    {
      id: "date",
      header: "Date",
      width: "120px",
      cell: (r) => (
        <span title={r.date}>{r.publishedAt ? relativeTime(r.publishedAt) : r.date}</span>
      ),
    },
    {
      id: "severity",
      header: "Severity",
      width: "90px",
      cell: (r) => <Badge tone={SEVERITY_TONE[r.severity]}>{r.severity}</Badge>,
    },
    {
      id: "description",
      header: "Description",
      cell: (r) => <p className="line-clamp-2 text-sm text-fg-muted">{r.description}</p>,
    },
    {
      id: "by",
      header: "Published by",
      hideOnNarrow: true,
      cell: (r) => <span className="truncate text-sm">{r.publishedBy}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Changelog"
        description="Track releases, deployments, and version history. Publish notes so the team knows what shipped and when."
      />

      <div className="mb-4">
        <Notice tone="info">
          This page calls the <strong>adminChangelog</strong> Cloud Function. Deploy it before
          entries appear. Until then the table below will show an error state.
        </Notice>
      </div>

      {canWrite && (
        <Panel title="Add Release Note" className="mb-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Version">
              {(p) => (
                <TextInput
                  {...p}
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="e.g. 2.4.0"
                />
              )}
            </Field>
            <Field label="Date">
              {(p) => (
                <TextInput
                  {...p}
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              )}
            </Field>
          </div>
          <Field label="Severity" className="mt-4 w-48">
            {(p) => (
              <Select {...p} value={severity} onChange={(e) => setSeverity(e.target.value as "major" | "minor" | "patch")}>
                <option value="patch">Patch</option>
                <option value="minor">Minor</option>
                <option value="major">Major</option>
              </Select>
            )}
          </Field>
          <Field label="Description" className="mt-4">
            {(p) => (
              <Textarea
                {...p}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What changed in this release?"
              />
            )}
          </Field>
          <div className="mt-4 flex justify-end">
            <Button variant="primary" onClick={publish} loading={publishing}>
              Publish
            </Button>
          </div>
        </Panel>
      )}

      <DataTable
        label="Release entries"
        columns={cols}
        rows={q.data?.entries ?? []}
        rowKey={(r) => r.id}
        loading={q.loading}
        error={q.error?.message ?? null}
        onRetry={q.reload}
        empty={{
          title: "No release notes yet",
          body: "Publish a release note above to start tracking your changelog.",
        }}
      />
    </>
  );
}
