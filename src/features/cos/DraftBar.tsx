"use client";

import { useState } from "react";
import { Badge, Button, ConfirmAction, Notice, useToast } from "@/ui";
import { operatorMessage } from "@/lib/apiErrors";
import { useCosCtx } from "./CosContext";
import { ChangeList } from "./widgets";
import { PUBLISH_PHRASE, riskySections } from "./logic";

const fmt = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString() : "");

/// The draft / publish control strip shown above every tab. Editing never
/// touches production: only "Publish" does, behind a typed phrase + reason.
export function DraftBar() {
  const c = useCosCtx();
  const toast = useToast();
  const [publishOpen, setPublishOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const draft = c.q.data?.draft ?? null;
  const risky = riskySections(draft?.changes ?? c.pending);
  const canSave = c.access.canEdit && c.dirty && !c.hasErrors && !c.busy;
  const canPublish = c.access.canPublish && !!draft && !c.dirty && !c.busy && !c.conflict;

  const save = async () => {
    try {
      await c.saveDraft();
      toast.success("Draft saved. Nothing is live until you publish.");
    } catch (e) {
      toast.error(operatorMessage(e));
    }
  };
  const validate = async () => {
    try {
      await c.validate();
    } catch (e) {
      toast.error(operatorMessage(e));
    }
  };

  return (
    <div className="mb-4 space-y-3 rounded-lg border border-line bg-panel p-3" aria-label="Draft and publish">
      <div className="flex flex-wrap items-center gap-2">
        {c.dirty ? <Badge tone="warning">Unsaved changes</Badge> : draft ? <Badge tone="info">Draft v{draft.version} saved</Badge> : <Badge tone="neutral">No draft</Badge>}
        <span className="text-sm text-fg-muted">
          {c.pending.length === 0
            ? "Working copy matches what is published."
            : `${c.pending.length} section${c.pending.length === 1 ? "" : "s"} differ from the published version.`}
        </span>
        {draft?.updatedByEmail ? (
          <span className="text-xs text-fg-subtle">Draft by {draft.updatedByEmail}{draft.updatedAt ? `, ${fmt(draft.updatedAt)}` : ""}</span>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {c.access.canEdit ? (
            <>
              <Button size="sm" variant="ghost" disabled={!c.dirty || c.busy} onClick={c.resetWorking}>
                Revert edits
              </Button>
              <Button size="sm" disabled={c.busy} onClick={validate}>
                Validate
              </Button>
              <Button size="sm" variant="primary" disabled={!canSave} loading={c.busy} onClick={save}>
                Save draft
              </Button>
              <Button size="sm" variant="danger-ghost" disabled={!draft || c.busy} onClick={() => setDiscardOpen(true)}>
                Discard draft
              </Button>
            </>
          ) : null}
          {c.access.canPublish ? (
            <Button size="sm" variant="danger" disabled={!canPublish} onClick={() => setPublishOpen(true)} title={c.dirty ? "Save the draft first" : !draft ? "Nothing to publish" : undefined}>
              Publish...
            </Button>
          ) : null}
        </div>
      </div>

      {!c.access.canEdit ? <Notice tone="info">You have read-only access (cos.read). Editing needs cos.modify; publishing needs cos.publish.</Notice> : null}
      {c.hasErrors ? (
        <Notice tone="danger" title="Fix these before saving">
          <ul className="list-disc pl-4">
            {Object.entries(c.errors).map(([s, m]) => (
              <li key={s}>{m}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {c.conflict ? (
        <Notice tone="warning" title="Someone else changed this configuration" action={<Button size="sm" onClick={c.reload}>Reload</Button>}>
          Your save or publish was NOT applied. Reload to see the latest, then review the differences and try again.
        </Notice>
      ) : null}
      {c.stale && !c.conflict ? (
        <Notice tone="warning" title="The saved configuration changed while you were editing" action={<Button size="sm" onClick={c.resetWorking}>Discard my edits and reload</Button>}>
          Your unsaved edits are kept. Saving may be refused as a version conflict.
        </Notice>
      ) : null}
      {c.validation ? (
        c.validation.valid ? (
          <Notice tone="success" title="Valid">
            The server accepts this configuration. {c.validation.changes.length} section(s) differ from the published version.
            {c.validation.risky.length ? ` Sensitive: ${c.validation.risky.join(", ")}.` : ""}
          </Notice>
        ) : (
          <Notice tone="danger" title="Not valid">{c.validation.message}</Notice>
        )
      ) : null}

      <ConfirmAction
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title="Publish Conversation OS configuration"
        level="typed"
        phrase={PUBLISH_PHRASE}
        confirmLabel="Publish"
        danger
        impact={
          <div className="space-y-2">
            <p>
              This replaces the configuration every app reads. It creates a new version and can be rolled back from the Versions tab.
              {risky.length ? ` It changes sensitive sections: ${risky.join(", ")}.` : ""}
            </p>
            <ChangeList changes={draft?.changes ?? []} />
          </div>
        }
        onConfirm={async (reason) => {
          const r = await c.publish(reason);
          toast.success(`Published version ${r.version}`);
        }}
      />
      <ConfirmAction
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        title="Discard the draft"
        level="reason"
        confirmLabel="Discard draft"
        danger
        impact="The saved draft is deleted for everyone. The published configuration is not affected."
        onConfirm={async (reason) => {
          await c.discardDraft(reason);
          toast.success("Draft discarded");
        }}
      />
    </div>
  );
}
