// Port of backend/engine/supplier_scorer.py
import suppliersJson from "./data/suppliers.json";
import type { Disruption } from "./scenarios";

const SUPPLIERS = suppliersJson as unknown as any[];
const r = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

export function getRankedSuppliers(category: string, disruptions: Record<string, Disruption> = {}) {
  const out = SUPPLIERS.filter((s) => s.category === category).map((s) => {
    const costScore = 1 - s.unit_cost / 1000;
    let lead = s.base_lead_time_days, penalty = 0, inflation = 0;
    for (const [node, imp] of Object.entries(disruptions)) {
      if (node === s.location_hub || (s.transit_choke_points ?? []).includes(node)) {
        const p = (imp.delay / 24) * 0.5; lead += p; penalty += p; inflation += imp.threat * 0.3;
      }
    }
    const leadScore = Math.max(0, 1 - lead / 30);
    const rel = Math.max(0.03, Math.min(0.98, s.historical_reliability - inflation));
    const total = costScore * 0.3 + leadScore * 0.3 + rel * 0.4;
    return {
      ...s, effective_lead_time: r(lead, 1), decision_score: r(total, 2),
      audit_trace: {
        scores: { cost: r(costScore, 2), lead_time: r(leadScore, 2), reliability: r(rel, 2) },
        penalties: { lead_time_impact: r(penalty, 1), risk_inflation: r(inflation, 2) },
        effective_metrics: { lead_time_days: r(lead, 1), stability_index: Math.round(rel * 100) },
      },
    };
  });
  out.sort((a, b) => b.decision_score - a.decision_score);
  out.forEach((s, i) => (s.rank = i + 1));
  return out;
}

export function getProcurementAdvice(current: number, safety: number, demand: number) {
  const projected = current - demand;
  let status = "HEALTHY", recommendation = "Maintain current replenishment schedule.", urgency = "LOW";
  if (projected <= 0) { status = "CRITICAL_SHORTAGE"; recommendation = "EMERGENCY REPLENISHMENT REQUIRED. Projected stockout in current cycle."; urgency = "CRITICAL"; }
  else if (projected < safety) { status = "SAFETY_STOCK_VIOLATION"; recommendation = "Expedite sourcing from high-reliability suppliers to restore safety buffers."; urgency = "HIGH"; }
  return { status, shortage_quantity: Math.max(0, safety - projected), recommendation, urgency_level: urgency, projected_inventory: projected };
}
