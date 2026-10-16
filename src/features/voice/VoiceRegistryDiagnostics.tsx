"use client";

import type { FieldDef } from "../config/logic";
import { voiceFieldMetadata, unavailableVoiceFields } from "./voiceFieldMetadata";

/** Read-only projection of the registry already loaded by the Voice page. */
export function VoiceRegistryDiagnostics({ fields }: {
  fields: readonly Pick<FieldDef, "key" | "target" | "type">[];
}) {
  const rows = voiceFieldMetadata(fields);
  const unavailable = unavailableVoiceFields(rows);
  return (
    <section aria-label="Voice registry diagnostics" className="rounded-lg border border-line bg-panel p-4">
      {unavailable.length > 0 ? (
        <div role="status" className="mb-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
          <p className="font-medium">Some voice controls cannot be displayed</p>
          <p>The registry returned by the server is missing these voice definitions or assigns them to another target:</p>
          <p className="mt-1 break-words font-mono text-xs">{unavailable.join(", ")}</p>
          <p className="mt-2">Their activation state and configuration values cannot be determined from this diagnostic.</p>
        </div>
      ) : null}
      <details open={unavailable.length > 0}>
        <summary className="cursor-pointer text-sm font-medium">
          Voice field definitions ({rows.length - unavailable.length}/{rows.length} available)
        </summary>
        <p className="my-2 text-xs text-fg-subtle">Read-only metadata from the loaded registry. No configuration values or provider credentials are included.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead><tr>
              <th scope="col" className="p-2">Key</th>
              <th scope="col" className="p-2">Present</th>
              <th scope="col" className="p-2">Target</th>
              <th scope="col" className="p-2">Type</th>
            </tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row.key} className="border-t border-line">
                <th scope="row" className="p-2 font-mono font-normal">{row.key}</th>
                <td className="p-2">{row.present ? "Yes" : "No"}</td>
                <td className="p-2">{row.target ?? "—"}</td>
                <td className="p-2">{row.type ?? "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
