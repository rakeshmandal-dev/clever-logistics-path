import { describe, expect, it } from "vitest";
import { CARFFilter, ContrastiveNLPEngine } from "./threat";
import { RouteRecommender } from "./recommender";

const carf = new CARFFilter();
const nlp = new ContrastiveNLPEngine();

describe("threat intelligence + CARF", () => {
  it("safe news at/below noise floor scores 0", () => {
    expect(nlp.getSemanticScore("Normal operations reported across terminals, no disruptions.")).toBe(0);
  });
  it("disaster news above floor scores > 0", () => {
    expect(nlp.getSemanticScore("Port closed due to labor strike, terminal shutdown")).toBeGreaterThan(0);
  });
  it("port strike is rejected for rail", () => {
    const a = carf.explainFilter(0.8, "Major port strike halts container terminal operations", "rail");
    expect(a.false_alarm_rejected).toBe(true);
    expect(a.carf_filtered_score).toBe(0);
  });
  it("sea threat retained for sea", () => {
    expect(carf.applyFilter(0.8, "Vessel grounding blocks the canal", "sea")).toBe(0.8);
  });
  it("flooding retained for road", () => {
    expect(carf.applyFilter(0.7, "Severe flooding closes the highway", "road")).toBe(0.7);
  });
  it("air-traffic-only outage rejected for road", () => {
    const a = carf.explainFilter(0.6, "Air traffic control outage grounds flights", "road");
    expect(a.false_alarm_rejected).toBe(true);
  });
});

describe("route recommender", () => {
  const rec = new RouteRecommender();
  it("SUEZ_BLOCK reroutes Shanghai -> Rotterdam around Suez", () => {
    const normal: any = rec.recommend({ source: "PORT-SHANGHAI", destination: "PORT-ROTTERDAM", transport_preference: "sea" });
    const blocked: any = rec.recommend({ source: "PORT-SHANGHAI", destination: "PORT-ROTTERDAM", scenario: "SUEZ_BLOCK", transport_preference: "sea" });
    const top = blocked.recommendations[0];
    const hubs = top.legs.map((l: any) => l.to);
    console.log("normal:", normal.recommendations.map((r: any) => `${r.persona} ${r.adjusted_eta}h ${r.legs.map((l: any) => l.to).join(">")}`));
    console.log("blocked:", blocked.recommendations.map((r: any) => `${r.persona} ${r.adjusted_eta}h risk=${r.threat_level} ml=${r.predicted_ml_delay} ${r.legs.map((l: any) => l.to).join(">")}`));
    expect(hubs).not.toContain("CHOKE-SUEZ");
    for (const h of ["PORT-SINGAPORE", "PORT-COLOMBO", "PORT-DURBAN", "PORT-ALGECIRAS"]) expect(hubs).toContain(h);
    expect(top.ai_decision.reroute_active).toBe(true);
    expect(top.predicted_ml_delay).toBeGreaterThan(0);
  });
  it("SUEZ_BLOCK yields non-zero scenario impact and an alternate route (deterministic)", () => {
    const req = { source: "PORT-SHANGHAI", destination: "PORT-ROTTERDAM", transport_preference: "sea" };
    const normal: any = rec.recommend(req);
    const a: any = rec.recommend({ ...req, scenario: "SUEZ_BLOCK" });
    const b: any = rec.recommend({ ...req, scenario: "SUEZ_BLOCK" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const sa = a.recommendations[0].scenario_audit;
    expect(sa.scenario_id).toBe("SUEZ_BLOCK");
    expect(sa.disruption_delay_hours).toBeGreaterThan(0);
    expect(sa.affected_corridors.map((c: any) => c.id)).toContain("CHOKE-SUEZ");
    expect(sa.bypasses_affected_corridor).toBe(true);
    expect(sa.avoided_delay_hours).toBeGreaterThan(0);
    const sig = (r: any) => r.legs.map((l: any) => l.to).join(">");
    expect(sig(a.recommendations[0])).not.toBe(sig(normal.recommendations[0]));
    expect(normal.recommendations[0].scenario_audit).toBeUndefined();
  });
  it("no bypass badge when scenario does not affect the baseline route", () => {
    for (const q of [
      { source: "RAIL-DELHI", destination: "PORT-KOCHI", scenario: "LA_PORT_STRIKE" },
      { source: "PORT-SHANGHAI", destination: "PORT-ROTTERDAM", scenario: "RED_SEA_CONFLICT", transport_preference: "sea" },
    ]) {
      const res: any = rec.recommend(q);
      console.log(q.scenario, res.error ?? res.recommendations.map((r: any) => `${r.persona} reroute=${r.ai_decision.reroute_active} avoided=${r.scenario_audit?.avoided_delay_hours}`));
      for (const r of res.recommendations ?? []) {
        expect(r.ai_decision.reroute_active).toBe(false);
        expect(r.scenario_audit.avoided_delay_hours).toBe(0);
      }
    }
  });
  it("CARF whole-word matching: airport news is not a port threat", () => {
    expect(carf.applyFilter(0.6, "Airport closed, flights cancelled", "sea")).toBe(0);
    expect(carf.applyFilter(0.6, "Warehouse fire at depot", "sea")).toBe(0);
  });
});
