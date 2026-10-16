"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useCan } from '@/lib/session';
import { useCallable } from '@/lib/useCallable';
import { Button, ErrorState, Field, Notice, PageHeader, Panel, Select, Skeleton, Stat, StatStrip, Tabs, TextInput } from '@/ui';
import ServiceHealthPage from '../insights/HealthPage';
import { PlatformKeys } from '../ai/ProvidersPage';
import PersonalityPage from '../ai/PersonalityPage';
import PaymentGateways from '../revenue/PaymentGateways';
import FlagsPage from './FlagsPage';
import { useRegistry, useTarget } from './useConfig';
import { flagExport, formatPreview } from './matrixLogic';
import type { Permission } from '@/lib/permissions';
import css from './ControlMatrix.module.css';

const tabs = [
  { id: 'health', label: 'Health', permission: 'system.read' },
  { id: 'identity', label: 'Identity', permission: 'config.read' },
  { id: 'features', label: 'Features', permission: 'flags.read' },
  { id: 'engine', label: 'AI Engine', permission: 'ai.behaviour.read' },
  { id: 'localization', label: 'Localization', permission: 'config.read' },
  { id: 'keys', label: 'API Keys', permission: 'ai.providers.read' },
  { id: 'payments', label: 'Payments', permission: 'billing.read' },
] satisfies { id: string; label: string; permission: Permission }[];

function ExportFlags() {
  const reg = useRegistry();
  const q = useTarget('flags');
  const error = reg.error ?? q.error;
  function download() {
    if (!reg.data || !q.data || error) return;
    const blob = new Blob([JSON.stringify(flagExport(reg.data.flags, q.data), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'akaya-feature-flags.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div>
    <Button variant="secondary" icon="download" disabled={!reg.data || !q.data || !!error} onClick={download}>Export feature flags</Button>
    {error ? <p role="alert" className="mt-1 text-xs text-danger">Export unavailable: {error.message}</p> : null}
  </div>;
}

function OverviewCounts() {
  const reg = useRegistry(), q = useTarget('flags');
  if (reg.error || q.error) return <ErrorState compact message={(reg.error ?? q.error)!.message} onRetry={() => { reg.reload(); q.reload(); }} />;
  if (!reg.data || !q.data) return <Skeleton className="h-24 w-full" />;
  const flags = flagExport(reg.data.flags, q.data).flags;
  return <StatStrip>
    <Stat label="Registered features" value={flags.length} />
    <Stat label="Effective enabled" value={flags.filter(f => f.effective).length} tone="success" hint="Includes compiled defaults" />
    <Stat label="Explicit overrides" value={flags.filter(f => f.override !== null).length} />
    <Stat label="Flags version" value={q.data.version} hint="Versioned configuration" />
  </StatStrip>;
}

function previewForeground(hex: string) {
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  return luminance > .179 ? '#171413' : '#ffffff';
}

function Identity() {
  const [name, setName] = useState('Akaya'), [tagline, setTagline] = useState('Your AI companion');
  const [font, setFont] = useState('Inter'), [radius, setRadius] = useState('16');
  const [colors, setColors] = useState({ primary: '#e8834a', accent: '#b5561f', background: '#f7f5f4' });
  return <Panel title="Visual Identity" description="Explore colors, typography and a companion identity.">
    <Notice tone="info">Preview only. These choices last while this tab is open. App branding is managed in the app release.</Notice>
    <div className={css.columns}>
      <div className={css.fields}>
        <Field label="App name">{p => <TextInput {...p} maxLength={60} value={name} onChange={e => setName(e.target.value)} />}</Field>
        <Field label="Tagline">{p => <TextInput {...p} maxLength={160} value={tagline} onChange={e => setTagline(e.target.value)} />}</Field>
        <Field label="Font family">{p => <Select {...p} value={font} onChange={e => setFont(e.target.value)}>{['Inter','Arial','Georgia','monospace'].map(f => <option key={f}>{f}</option>)}</Select>}</Field>
        <Field label="Border radius">{p => <Select {...p} value={radius} onChange={e => setRadius(e.target.value)}>{[['0','None'],['6','Small'],['16','Medium'],['24','Large'],['999','Full']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
      </div>
      <div className={css.fields}>
        <div className={css.colors}>{(Object.keys(colors) as (keyof typeof colors)[]).map(key => <Field key={key} label={key === 'primary' ? 'Primary color' : key === 'accent' ? 'Accent color' : 'Background'} hint={colors[key].toUpperCase()}>{p => <input {...p} type="color" value={colors[key]} onChange={e => setColors({ ...colors, [key]: e.target.value })} />}</Field>)}</div>
        <div className={css.preview} style={{ background: colors.background, color: previewForeground(colors.background), fontFamily: font === 'Inter' ? 'Inter, system-ui, sans-serif' : font, borderRadius: Number(radius), borderColor: colors.primary }}>
          <p className="text-xs">Live preview</p>
          <strong>{name || 'Akaya'}</strong><p>{tagline}</p>
          <div className={css.previewButton} style={{ background: colors.accent, color: previewForeground(colors.accent), borderRadius: Number(radius) }}>Get Started</div>
        </div>
      </div>
    </div>
  </Panel>;
}

function Localization() {
  const q = useCallable<{ timezone: string; dateFormat: string }>('adminConfig', { action: 'getConsoleSettings' });
  const [tz, setTz] = useState<string | null>(null), [format, setFormat] = useState<string | null>(null);
  const [sampleDate] = useState(() => new Date());
  if (q.error) return <ErrorState message={q.error.message} onRetry={q.reload} />;
  if (!q.data) return <Skeleton className="h-64 w-full" />;
  const zone = tz ?? q.data.timezone, pattern = format ?? q.data.dateFormat;
  let example = 'Saved format is unsupported';
  try { example = formatPreview(sampleDate, zone, pattern); } catch { /* Invalid stored timezone is shown, never written. */ }
  return <Panel title="Localization Settings" description="Console formatting and supported language controls.">
    <Notice tone="info">Timezone and date choices below are a preview. Save console preferences in <Link className="underline" href="/dashboard/settings">Console Settings</Link>. App speech languages are managed in <Link className="underline" href="/dashboard/voice">Voice</Link>.</Notice>
    <div className={css.columns}>
      <div className={css.fields}>
        <Field label="Timezone">{p => <Select {...p} value={zone} onChange={e => setTz(e.target.value)}>{Array.from(new Set([q.data!.timezone,'UTC','Asia/Kolkata','America/New_York','Europe/London','Asia/Tokyo'])).map(v => <option key={v}>{v}</option>)}</Select>}</Field>
        <Field label="Date format">{p => <Select {...p} value={pattern} onChange={e => setFormat(e.target.value)}>{['DD/MM/YYYY','MM/DD/YYYY','YYYY-MM-DD'].map(v => <option key={v}>{v}</option>)}</Select>}</Field>
        <p className={css.sample}>Date preview: <strong>{example}</strong></p>
      </div>
      <div className={css.fields}>
        <div className={css.unavailable}><strong>Auto-translate all messages</strong><p>Global automatic translation is not configured. Translation remains a user-requested capability.</p></div>
        <div className={css.unavailable}><strong>Global RTL layout</strong><p>A runtime app-wide RTL switch is unavailable.</p></div>
      </div>
    </div>
  </Panel>;
}

export default function ControlMatrix() {
  const can = useCan();
  const [selected, setSelected] = useState('health'), [refresh, setRefresh] = useState(0);
  const allowed = tabs.filter(t => can(t.permission));
  const active = allowed.find(t => t.id === selected) ?? allowed[0];
  if (!can('config.read')) return <Notice tone="warning">Control Matrix requires config.read.</Notice>;
  return <div className={css.root}>
    <PageHeader title="Control Matrix" description="Central configuration hub · Changes are reviewed and versioned"
      actions={<><Button variant="secondary" icon="refresh" onClick={() => setRefresh(r => r + 1)}>Refresh</Button>{can('flags.read') ? <ExportFlags key={`export-${refresh}`} /> : null}</>} />
    <div className={css.tabs}><Tabs tabs={allowed} value={active?.id ?? ''} onChange={setSelected} label="Control Matrix sections" /></div>
    {active ? <section key={`${active.id}-${refresh}`} id={`tabpanel-${active.id}`} role="tabpanel" aria-labelledby={`tab-${active.id}`} className={css.content}>
      {active.id === 'health' ? <>{can('flags.read') ? <OverviewCounts /> : null}<ServiceHealthPage /></> : null}
      {active.id === 'identity' ? <Identity /> : null}
      {active.id === 'features' ? <><Notice tone="info">These flags apply globally on the next configuration read. Percentage rollouts are unavailable.</Notice><FlagsPage bulk /></> : null}
      {active.id === 'engine' ? <PersonalityPage /> : null}
      {active.id === 'localization' ? <Localization /> : null}
      {active.id === 'keys' ? <><PlatformKeys /><p className="text-sm text-fg-muted">Manage provider-specific credentials in <Link className="underline" href="/dashboard/providers">Providers &amp; Keys</Link>. Usage is available in <Link className="underline" href="/dashboard/ai-usage">AI Usage &amp; Cost</Link>.</p></> : null}
      {active.id === 'payments' ? <PaymentGateways /> : null}
    </section> : <Notice tone="warning">No sections are available for your role.</Notice>}
  </div>;
}
