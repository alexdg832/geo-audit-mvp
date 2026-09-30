import { gradeFor } from "@/lib/scoring";

const TONE_COLORS: Record<string, string> = {
  bad: "#b91c1c",
  mid: "#b45309",
  good: "#15803d",
};

export function ScoreGauge({ score, grade, size = "lg" }: { score: number; grade?: string; size?: "lg" | "md" }) {
  const band = gradeFor(score);
  const label = grade ?? band.grade;
  const radius = 80;
  const circumference = Math.PI * radius;
  const progress = Math.max(0, Math.min(100, score)) / 100;
  const dashOffset = circumference * (1 - progress);
  const color = TONE_COLORS[band.tone];

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 110" className={size === "lg" ? "h-auto w-64" : "h-auto w-40"} role="img" aria-label={`Score ${score} of 100, ${label}`}>
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#e7e5e4" strokeWidth={16} strokeLinecap="round" />
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke={color}
          strokeWidth={16}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
        <text x="100" y="85" textAnchor="middle" className="fill-stone-900" style={{ fontSize: 40, fontWeight: 700 }}>
          {score}
        </text>
      </svg>
      <span className="mt-1 rounded-full px-4 py-1 text-sm font-semibold text-white" style={{ backgroundColor: color }}>
        {label}
      </span>
    </div>
  );
}
