"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface Props {
  brands: Array<{ key: string; name: string }>;
  client: string;
}

/** Switch whose point of view the dashboard takes. Kept in the URL so views can be shared. */
export function PerspectiveSwitch({ brands, client }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const asParam = params.get("as");
  const current = brands.some((b) => b.key === asParam) ? asParam! : client;
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="kicker">Viewing as</span>
      <select
        className="rounded-md border border-rule bg-card px-2 py-1 text-sm font-medium"
        value={current}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          if (e.target.value === client) next.delete("as");
          else next.set("as", e.target.value);
          const qs = next.toString();
          router.push(qs ? `${pathname}?${qs}` : pathname);
        }}
      >
        {brands.map((b) => (
          <option key={b.key} value={b.key}>
            {b.name}
            {b.key === client ? " (client)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
