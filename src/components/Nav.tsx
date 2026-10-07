"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const LINKS = [
  { href: "/", label: "Monday brief" },
  { href: "/questions", label: "Questions & answers" },
  { href: "/head-to-head", label: "Head-to-head" },
  { href: "/facts", label: "Wrong facts" },
  { href: "/sources", label: "Sources" },
  { href: "/data", label: "Data & exports" },
];

export function Nav() {
  const pathname = usePathname();
  const as = useSearchParams().get("as");
  return (
    <nav aria-label="Main navigation" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
      {LINKS.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={as ? `${l.href}?as=${as}` : l.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors ${
              active ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-2 hover:text-ink"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
