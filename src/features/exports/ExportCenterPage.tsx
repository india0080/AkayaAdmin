"use client";

import { useState } from "react";
import { callAdmin, type AdminApiError } from "@/lib/api";
import { useCan } from "@/lib/session";
import {
  Badge, Button, Notice, PageHeader, Panel, useToast,
} from "@/ui";

interface ExportResult {
  filename: string;
  rows: number;
  truncated: boolean;
  masked: boolean;
  csv: string;
}

const EXPORT_TYPES = [
  { kind: "users", label: "Users CSV", icon: "users", permission: "audit.read" as const },
  { kind: "audit", label: "Audit Log CSV", icon: "scroll", permission: "audit.read" as const },
] as const;

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ExportCenterPage() {
  const can = useCan();
  const toast = useToast();
  const [generating, setGenerating] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ kind: string; result: ExportResult } | null>(null);

  async function generate(kind: string) {
    setGenerating(kind);
    try {
      const res = await callAdmin<ExportResult>("adminExport", { kind, reason: "Console export" });
      setLastResult({ kind, result: res });
      downloadCsv(res.filename, res.csv);
      toast.success(`${res.rows} rows exported`, res.truncated ? "Export was capped at 5,000 rows." : undefined);
    } catch (e) {
      toast.error("Export failed", (e as AdminApiError).message);
    } finally {
      setGenerating(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Reports & Exports"
        description="Generate and download CSV exports. Exports run inline and download immediately."
      />
      <Panel title="Generate Report" description="Choose a report type to generate a CSV export.">
        <div className="flex flex-wrap gap-2">
          {EXPORT_TYPES.map((et) => (
            <Button
              key={et.kind}
              icon={et.icon}
              loading={generating === et.kind}
              disabled={!can(et.permission) || generating !== null}
              onClick={() => void generate(et.kind)}
            >
              {et.label}
            </Button>
          ))}
        </div>
      </Panel>

      <div className="mt-4">
        <Notice tone="info">
          Exports are bounded to 5,000 rows. The backend supports <strong>users</strong> and <strong>audit</strong> exports.
          Subscription, payment, and AI usage exports will be available after additional backend actions are deployed.
        </Notice>
      </div>

      {lastResult ? (
        <Panel title="Last Export" className="mt-4">
          <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
            <dt className="text-fg-muted">Type</dt>
            <dd><Badge>{lastResult.kind}</Badge></dd>
            <dt className="text-fg-muted">File</dt>
            <dd className="font-mono text-xs">{lastResult.result.filename}</dd>
            <dt className="text-fg-muted">Rows</dt>
            <dd>{lastResult.result.rows.toLocaleString()}{lastResult.result.truncated ? " (capped)" : ""}</dd>
            <dt className="text-fg-muted">PII</dt>
            <dd>{lastResult.result.masked ? "Masked" : "Visible"}</dd>
          </dl>
          <div className="mt-3">
            <Button variant="ghost" size="sm" onClick={() => downloadCsv(lastResult.result.filename, lastResult.result.csv)}>
              Download again
            </Button>
          </div>
        </Panel>
      ) : null}
    </>
  );
}
