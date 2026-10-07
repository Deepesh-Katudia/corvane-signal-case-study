"use client";

import type { ReactNode } from "react";

/** A plain GET form that re-submits whenever a filter changes (still works as a normal form without JS). */
export function AutoSubmitForm({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <form method="get" className={className} onChange={(e) => (e.currentTarget as HTMLFormElement).requestSubmit()}>
      {children}
    </form>
  );
}
