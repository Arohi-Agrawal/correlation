interface ConfidenceBadgeProps {
  confidence: number;
}

export function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  let label = "Weak";
  let className = "bg-amber-100 text-amber-700";

  if (confidence >= 80) {
    label = "Strong";
    className = "bg-emerald-100 text-emerald-700";
  } else if (confidence >= 60) {
    label = "Medium";
    className = "bg-blue-100 text-blue-700";
  } else if (confidence < 40) {
    label = "Low";
    className = "bg-rose-100 text-rose-700";
  }

  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>{label}</span>;
}
