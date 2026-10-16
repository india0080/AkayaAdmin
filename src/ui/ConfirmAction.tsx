"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { Field, TextInput, Textarea } from "./Field";
import { Notice } from "./States";
import { operatorMessage } from "@/lib/apiErrors";
import { canConfirm, type ConfirmLevel } from "./logic";

/// How much friction an action deserves. Harmless actions should not use
/// this at all; the levels escalate for impact, not for ceremony.
///   confirm — one click to confirm, impact stated
///   reason  — plus a mandatory reason (recorded in the audit log)
///   typed   — plus typing a phrase (kill switches, broadcast, pricing)
export type { ConfirmLevel };

export interface ConfirmActionProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /// What will happen, to whom, and whether it can be undone.
  impact: ReactNode;
  level: ConfirmLevel;
  confirmLabel: string;
  danger?: boolean;
  /// Phrase to type for level "typed" (e.g. the entity name).
  phrase?: string;
  /// Runs the action. Throw to show the error in-dialog (dialog stays open,
  /// nothing is retried automatically).
  onConfirm: (reason: string) => Promise<void>;
}

export function ConfirmAction({
  open,
  onClose,
  title,
  impact,
  level,
  confirmLabel,
  danger,
  phrase,
  onConfirm,
}: ConfirmActionProps) {
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setTyped("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const ready = canConfirm(level, reason, typed, phrase);

  // State updates are batched, so two same-tick submits both see busy=false.
  // A ref flips synchronously and closes that window.
  const inFlight = useRef(false);

  async function run() {
    if (!ready || busy || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (e) {
      setError(operatorMessage(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      title={title}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={run} disabled={!ready} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <Notice tone={danger ? "warning" : "info"}>{impact}</Notice>
        {level !== "confirm" ? (
          <Field label="Reason" required hint="Recorded in the audit log with your name.">
            {(p) => (
              <Textarea
                {...p}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                placeholder="Why is this change being made?"
                autoFocus
              />
            )}
          </Field>
        ) : null}
        {level === "typed" && phrase ? (
          <Field label={`Type "${phrase}" to confirm`} required>
            {(p) => (
              <TextInput {...p} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
            )}
          </Field>
        ) : null}
        {error ? <Notice tone="danger" title="Not completed">{error}</Notice> : null}
        {/* Enter submits from the text fields */}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
