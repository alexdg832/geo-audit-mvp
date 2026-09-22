import { ReactNode } from "react";

/** Pure-CSS tooltip for one-line jargon explanations. No JS required. */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex items-center border-b border-dotted border-stone-400 cursor-help">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 rounded-lg bg-stone-900 px-3 py-2 text-xs font-normal text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}
