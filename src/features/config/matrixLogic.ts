import type { FlagDef, TargetState } from './logic';

export function bulkFlagPatch(flags: FlagDef[], snapshot: Record<string, unknown>, enabled: boolean) {
  return Object.fromEntries(flags.filter(f => {
    const stored = snapshot[f.key];
    return (typeof stored === 'boolean' ? stored : f.defaultWhenAbsent) !== enabled;
  }).map(f => [f.key, enabled]));
}

// Only registered boolean flags are exported. Arbitrary config keys, hints,
// provider credentials and raw callable responses never enter the download.
export function flagExport(flags: FlagDef[], state: TargetState) {
  return {
    schema: 1,
    scope: 'Registered feature flags only',
    version: state.version,
    flags: flags.map(f => {
      const stored = state.snapshot[f.key];
      const override = typeof stored === 'boolean' ? stored : null;
      return { key: f.key, override, effective: override ?? f.defaultWhenAbsent };
    }),
  };
}

export function formatPreview(date: Date, timezone: string, format: string) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (key: string) => parts.find(p => p.type === key)?.value ?? '';
  const d = get('day'), m = get('month'), y = get('year');
  return format === 'YYYY-MM-DD' ? `${y}-${m}-${d}` : format === 'MM/DD/YYYY' ? `${m}/${d}/${y}` : `${d}/${m}/${y}`;
}
