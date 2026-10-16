"use client";

import { useState } from "react";
import { callAdmin } from "@/lib/api";
import { Button } from "./Button";
import { ConfirmAction } from "./ConfirmAction";
import { useToast } from "./Toast";

interface ExportResult {
  filename: string;
  rows: number;
  truncated: boolean;
  masked: boolean;
  csv: string;
}

/// Server-side CSV export (adminExport): asks for a reason (the export is
/// audited), then saves the file the server built. Nothing is exported from
/// what happens to be loaded in the browser.
export function ExportButton({
  kind,
  filter,
  what,
}: {
  kind: "users" | "audit";
  filter?: Record<string, string>;
  what: string;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" icon="download" onClick={() => setOpen(true)}>Export CSV</Button>
      <ConfirmAction
        open={open}
        onClose={() => setOpen(false)}
        title={`Export ${what}`}
        level="reason"
        confirmLabel="Export"
        impact={<>Up to the newest 5,000 rows. The export is recorded in the audit log with your reason.{kind === "users" ? " Emails and phone numbers are masked unless you hold the PII permission." : ""}</>}
        onConfirm={async (reason) => {
          const r = await callAdmin<ExportResult>("adminExport", { kind, reason, ...(filter ?? {}) });
          const url = URL.createObjectURL(new Blob([r.csv], { type: "text/csv;charset=utf-8" }));
          const a = document.createElement("a");
          a.href = url;
          a.download = r.filename;
          a.click();
          URL.revokeObjectURL(url);
          toast.success(`Exported ${r.rows.toLocaleString("en-IN")} rows`, [r.truncated ? "Truncated at 5,000." : "", r.masked ? "PII masked." : ""].filter(Boolean).join(" ") || undefined);
        }}
      />
    </>
  );
}
