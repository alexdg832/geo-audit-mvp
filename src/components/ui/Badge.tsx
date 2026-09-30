import { ReactNode } from "react";

type Tone = "neutral" | "green" | "amber" | "red" | "indigo" | "stone";

const TONES: Record<Tone, string> = {
  neutral: "bg-stone-100 text-stone-700",
  stone: "bg-stone-200 text-stone-800",
  green: "bg-green-100 text-green-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
  indigo: "bg-indigo-100 text-indigo-800",
};

export function Badge({ tone = "neutral", children, className = "", title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function tierTone(tier: number): Tone {
  if (tier === 1) return "indigo";
  if (tier === 2) return "green";
  if (tier === 3) return "amber";
  return "red";
}

export function confidenceTone(confidence: string): Tone {
  if (confidence === "high") return "green";
  if (confidence === "medium") return "amber";
  return "red";
}
