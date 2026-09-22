import { gradeForScore } from "@/lib/audit/score";

const TONE_COLORS: Record<string, string> = {
  bad: "#dc2626",
  mid: "#d97706",
  good: "#16a34a",
};

export function ScoreGauge({ score }: { score: number }) {
  const grade = gradeForScore(score);
  const radius = 80;
  const circumference = Math.PI * radius; // half circle
  const progress = Math.max(0, Math.min(100, score)) / 100;
  const dashOffset = circumference * (1 - progress);
  const color = TONE_COLORS[grade.tone];

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 110" className="w-64 h-auto">
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="#e7e5e4"
          strokeWidth={16}
          strokeLinecap="round"
        />
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
      <span
        className="mt-1 rounded-full px-4 py-1 text-sm font-semibold text-white"
        style={{ backgroundColor: color }}
      >
        {grade.label}
      </span>
    </div>
  );
}
