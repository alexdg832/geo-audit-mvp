import { Badge } from "@/components/ui/Badge";
import type { ReportData } from "@/lib/report/load";
import { Section } from "./Section";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function CostOfInaction({ data }: { data: ReportData }) {
  const cost = data.report.costOfInaction;
  if (!cost) return null;
  return (
    <Section id="cost" title="What staying invisible costs" intro="An estimate of customer discovery lost each month while AI sends people elsewhere. The measured input is your mention rate; everything else is a stated assumption you can replace with your own numbers.">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Figure label="Customers AI never shows you" value={`${cost.missedDiscoveriesPerMonth}/mo`} note={`${Math.round((1 - cost.mentionRate) * 100)}% of AI queries omit you`} />
        <Figure label="Estimated lost customers" value={`${cost.estimatedLostCustomersPerMonth}/mo`} note="missed discoveries × capture rate" />
        <Figure label="Estimated lost revenue" value={`${usd.format(cost.estimatedLostRevenuePerMonth)}/mo`} note={`${usd.format(cost.estimatedLostRevenuePerYear)} per year`} />
      </div>
      <div className="mt-4 rounded-lg bg-stone-50 p-3 text-xs text-stone-600">
        <p className="flex items-center gap-2">
          <Badge tone="amber">estimate</Badge>
          <span>Formula: {cost.formula}. Measured mention rate: {Math.round(cost.mentionRate * 100)}%.</span>
        </p>
        <table className="mt-2 w-full">
          <tbody>
            {cost.assumptions.map((a) => (
              <tr key={a.key} className="align-top">
                <td className="py-0.5 pr-3 text-stone-700">{a.label}</td>
                <td className="py-0.5 pr-3 font-medium tabular-nums text-stone-900">{a.key === "captureRate" ? `${Math.round(a.value * 100)}%` : a.key === "avgCustomerValue" ? usd.format(a.value) : a.value}</td>
                <td className="py-0.5 text-stone-500">{a.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-stone-200 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-stone-900">{value}</div>
      <div className="text-xs text-stone-500">{note}</div>
    </div>
  );
}
