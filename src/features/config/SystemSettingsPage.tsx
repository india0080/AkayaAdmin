"use client";

import { useCallback, useState } from "react";
import { callAdmin } from "@/lib/api";
import { useCan } from "@/lib/session";
import { useCallable } from "@/lib/useCallable";
import { Button, ErrorState, Field, Notice, PageHeader, Panel, Select, Skeleton, Switch, useToast } from "@/ui";

interface ConsoleSettings {
  timezone: string;
  dateFormat: string;
  density: "comfortable" | "compact";
  notifyCriticalAlerts: boolean;
  notifyWeeklyDigest: boolean;
  notifyDeployments: boolean;
  auditRetentionDays: number;
  exportRetentionDays: number;
}

const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "US Eastern" },
  { value: "America/Chicago", label: "US Central" },
  { value: "America/Denver", label: "US Mountain" },
  { value: "America/Los_Angeles", label: "US Pacific" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Australia/Sydney", label: "Sydney" },
];

const DATE_FORMATS = [
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD (ISO)" },
];

const DEFAULTS: ConsoleSettings = {
  timezone: "Asia/Kolkata",
  dateFormat: "DD/MM/YYYY",
  density: "comfortable",
  notifyCriticalAlerts: true,
  notifyWeeklyDigest: false,
  notifyDeployments: true,
  auditRetentionDays: 90,
  exportRetentionDays: 30,
};

export default function SystemSettingsPage() {
  const can = useCan();
  const toast = useToast();
  const q = useCallable<ConsoleSettings>("adminConfig", { action: "getConsoleSettings" });
  const [draft, setDraft] = useState<ConsoleSettings | null>(null);
  const [saving, setSaving] = useState(false);

  const settings = draft ?? q.data ?? DEFAULTS;
  const canEdit = can("config.modify");

  const patch = useCallback(
    (partial: Partial<ConsoleSettings>) => setDraft((d) => ({ ...(d ?? q.data ?? DEFAULTS), ...partial })),
    [q.data],
  );

  if (q.error && !q.data) return <ErrorState message={q.error.message} onRetry={q.reload} />;

  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(q.data ?? DEFAULTS);

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      await callAdmin("adminConfig", { action: "saveConsoleSettings", settings: draft });
      toast.success("Saved", "Console settings updated.");
      setDraft(null);
      q.reload();
    } catch (e: unknown) {
      toast.error("Save failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Console Settings"
        description="Preferences for this admin console — timezone, display density and notification subscriptions. These do not affect the end-user app."
      />
      {!q.data && q.loading ? <Skeleton className="h-96 w-full" /> : (
        <div className="space-y-4">
          <Panel title="Display" description="Timezone, date format and layout density for the admin console.">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Timezone">
                {(p) => (
                  <Select {...p} value={settings.timezone} disabled={!canEdit} onChange={(e) => patch({ timezone: e.target.value })}>
                    {TIMEZONES.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Date format">
                {(p) => (
                  <Select {...p} value={settings.dateFormat} disabled={!canEdit} onChange={(e) => patch({ dateFormat: e.target.value })}>
                    {DATE_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Density">
                {(p) => (
                  <Select {...p} value={settings.density} disabled={!canEdit} onChange={(e) => patch({ density: e.target.value as "comfortable" | "compact" })}>
                    <option value="comfortable">Comfortable</option>
                    <option value="compact">Compact</option>
                  </Select>
                )}
              </Field>
            </div>
          </Panel>

          <Panel title="Notifications" description="Email notification preferences for admin accounts.">
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-md border border-line p-3">
                <div>
                  <p className="text-sm font-medium">Critical alerts</p>
                  <p className="mt-0.5 text-xs text-fg-muted">Receive an email when a critical system alert fires.</p>
                </div>
                <Switch label="Critical alerts" checked={settings.notifyCriticalAlerts} disabled={!canEdit} onChange={(v) => patch({ notifyCriticalAlerts: v })} />
              </div>
              <div className="flex items-center justify-between rounded-md border border-line p-3">
                <div>
                  <p className="text-sm font-medium">Weekly digest</p>
                  <p className="mt-0.5 text-xs text-fg-muted">A weekly summary of platform activity and metrics.</p>
                </div>
                <Switch label="Weekly digest" checked={settings.notifyWeeklyDigest} disabled={!canEdit} onChange={(v) => patch({ notifyWeeklyDigest: v })} />
              </div>
              <div className="flex items-center justify-between rounded-md border border-line p-3">
                <div>
                  <p className="text-sm font-medium">Deployment notifications</p>
                  <p className="mt-0.5 text-xs text-fg-muted">Get notified after a successful Cloud Functions deployment.</p>
                </div>
                <Switch label="Deployment notifications" checked={settings.notifyDeployments} disabled={!canEdit} onChange={(v) => patch({ notifyDeployments: v })} />
              </div>
            </div>
          </Panel>

          <Panel title="Data Retention" description="How long the platform retains audit and export data. These values are read from server config.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-md border border-line p-3">
                <p className="text-xs font-medium text-fg-muted">Audit log retention</p>
                <p className="mt-1 text-lg font-semibold text-fg">{settings.auditRetentionDays} days</p>
              </div>
              <div className="rounded-md border border-line p-3">
                <p className="text-xs font-medium text-fg-muted">Export retention</p>
                <p className="mt-1 text-lg font-semibold text-fg">{settings.exportRetentionDays} days</p>
              </div>
            </div>
            <div className="mt-3"><Notice tone="info">Retention periods are set in the server configuration and cannot be changed from the console.</Notice></div>
          </Panel>

          {canEdit && dirty ? (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDraft(null)}>Discard</Button>
              <Button variant="primary" loading={saving} onClick={save}>Save settings</Button>
            </div>
          ) : null}
          {!canEdit ? <p className="text-xs text-fg-subtle">Your role can view console settings but not change them.</p> : null}
        </div>
      )}
    </>
  );
}
