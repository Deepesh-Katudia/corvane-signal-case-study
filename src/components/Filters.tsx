import { AutoSubmitForm } from "./AutoSubmitForm";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDef {
  name: string;
  label: string;
  value: string;
  options: FilterOption[];
}

export function Filters({ filters, hidden = {} }: { filters: FilterDef[]; hidden?: Record<string, string> }) {
  return (
    <AutoSubmitForm className="flex flex-wrap items-end gap-3 rounded-lg border border-rule bg-card p-3">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {filters.map((f) => (
        <label key={f.name} className="flex min-w-[9rem] flex-1 flex-col gap-1 text-xs sm:flex-none">
          <span className="kicker">{f.label}</span>
          <select name={f.name} defaultValue={f.value} className="rounded-md border border-rule bg-paper px-2 py-1.5 text-sm">
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      <noscript>
        <button type="submit" className="rounded-md bg-ink px-3 py-1.5 text-sm text-paper">
          Apply
        </button>
      </noscript>
    </AutoSubmitForm>
  );
}
