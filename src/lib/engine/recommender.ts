// Port of backend/engine/route_recommender.py (patched): persona Dijkstra with
// scenario disruptions, ML p85 delay in weights, CARF audit per leg, AI decision.
import locationsJson from "./data/canonical_locations.json";
import { createMultimodalNetwork, HUBS, type Edge, type Graph } from "./network";
import { CARFFilter, ContrastiveNLPEngine, ThreatIntelligencePredictor } from "./threat";
import { getDisruptions, getScenario, type Scenario } from "./scenarios";

const LOCATIONS = locationsJson as unknown as Record<string, Record<string, string>>;

export const FALLBACK_NEWS: Record<string, string> = {
  sea: "Maritime congestion reported at major transshipment hubs. Berthing delays expected.",
  air: "Aviation fuel surcharge volatility and cargo handling backlogs noted in international airports.",
  road: "Highway traffic density increasing in primary logistics corridors.",
  rail: "Rail freight scheduling adjustments due to infrastructure maintenance.",
};

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

export interface RecommendInput {
  source: string; destination: string; transport_preference?: string; routing_policy?: string;
  cargo_type?: string; priority?: string; scenario?: string | null;
  overrides?: { avoid_chokepoints?: string[]; cost_ceiling?: number; max_delay?: number } | null;
}

class MinHeap {
  private a: [number, number, string][] = [];
  private c = 0;
  get size() { return this.a.length; }
  push(p: number, v: string) {
    const a = this.a; a.push([p, this.c++, v]);
    let i = a.length - 1;
    while (i > 0) { const j = (i - 1) >> 1; if (this.lt(a[i]!, a[j]!)) { [a[i], a[j]] = [a[j]!, a[i]!]; i = j; } else break; }
  }
  pop(): [number, number, string] {
    const a = this.a; const top = a[0]!; const last = a.pop()!;
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && this.lt(a[l]!, a[m]!)) m = l;
        if (r < a.length && this.lt(a[r]!, a[m]!)) m = r;
        if (m === i) break; [a[i], a[m]] = [a[m]!, a[i]!]; i = m;
      }
    }
    return top;
  }
  private lt(x: [number, number, string], y: [number, number, string]) { return x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]); }
}

export class RouteRecommender {
  G: Graph;
  nlp = new ContrastiveNLPEngine();
  carf = new CARFFilter();
  predictor = new ThreatIntelligencePredictor();

  constructor() {
    this.G = createMultimodalNetwork();
    // Warm-up: enrich transit edges with CARF-screened baseline threat intelligence.
    for (const m of this.G.adj.values()) for (const e of m.values()) {
      if (e.transport_mode === "transfer") continue;
      const news = FALLBACK_NEWS[e.transport_mode] ?? "Normal conditions.";
      e.base_threat = this.carf.applyFilter(this.nlp.getSemanticScore(news), news, e.transport_mode);
      e.base_news = news;
    }
  }

  resolveEntry(loc: string): { id?: string; error?: string } {
    let physical: string | undefined;
    const hub = HUBS.find((h) => h.id === loc);
    const l = LOCATIONS[loc];
    if (l) physical = l["road"] ?? Object.values(l)[0];
    else if (hub) physical = loc;
    if (!physical) return { error: `Entry point unavailable for ${loc}` };
    const target = HUBS.find((h) => h.id === physical);
    if (!target) return { error: `Physical Hub mapping corrupted for ${physical}` };
    return { id: `${physical}:${target.modes.includes("road") ? "road" : target.modes[0]}` };
  }

  private mlDelay(uPid: string, pId: string, mode: string, threat: number) {
    const cond = threat > 0.6 ? "stormy" : threat > 0.3 ? "rainy" : "Clear";
    return this.predictor.predictWorstCaseDelay(
      uPid, pId, mode !== "transfer" ? mode : "road",
      mode === "road" || mode === "transfer" ? "Last_Mile" : "Global_Freight", cond, threat,
    ).final_delay_presented;
  }

  private hasPath(s: string, d: string, removed: Set<string>) {
    if (removed.has(s) || removed.has(d)) return false;
    const seen = new Set([s]); const q = [s];
    while (q.length) {
      const u = q.shift()!;
      if (u === d) return true;
      for (const v of this.G.adj.get(u)!.keys()) if (!seen.has(v) && !removed.has(v)) { seen.add(v); q.push(v); }
    }
    return false;
  }

  private dijkstra(s: string, d: string, removed: Set<string>, edgeOk: (e: Edge) => boolean, w: (u: string, e: Edge) => number): string[] | null {
    const dist = new Map<string, number>([[s, 0]]); const prev = new Map<string, string>();
    const done = new Set<string>(); const h = new MinHeap(); h.push(0, s);
    while (h.size) {
      const [du, , u] = h.pop();
      if (done.has(u)) continue; done.add(u);
      if (u === d) break;
      for (const e of this.G.adj.get(u)!.values()) {
        if (removed.has(e.to) || !edgeOk(e)) continue;
        const nd = du + w(u, e);
        if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, u); h.push(nd, e.to); }
      }
    }
    if (!done.has(d)) return null;
    const path = [d]; while (path[0] !== s) path.unshift(prev.get(path[0]!)!);
    return path;
  }

  recommend(req: RecommendInput) {
    const overrides = req.overrides ?? {};
    const avoid = new Set(overrides.avoid_chokepoints ?? []);
    const costCeiling = overrides.cost_ceiling ?? 999999;
    const maxDelay = overrides.max_delay ?? 9999;
    const pref = req.transport_preference ?? "any";
    const policy = req.routing_policy ?? "STRICT";

    const rs = this.resolveEntry(req.source), rd = this.resolveEntry(req.destination);
    if (rs.error) return { error: rs.error };
    if (rd.error) return { error: rd.error };
    const sV = rs.id!, dV = rd.id!;

    const scenario = getScenario(req.scenario);
    const disruptions = getDisruptions(req.scenario);
    const disrupted = new Set(Object.keys(disruptions));
    const vnodesOf = (hubs: Set<string>) => {
      const out = new Set<string>();
      for (const n of this.G.nodes.values()) if (hubs.has(n.physical_id)) out.add(n.id);
      return out;
    };

    const candidates: any[] = [];
    for (const persona of ["FASTEST", "SAFEST", "BALANCED"] as const) {
      let currentAvoid = new Set(avoid);
      if (persona === "SAFEST" && disrupted.size) {
        const test = new Set([...currentAvoid, ...disrupted]);
        if (this.hasPath(sV, dV, vnodesOf(test))) currentAvoid = test;
      }
      const removed = vnodesOf(currentAvoid);
      const allowed = pref !== "any" && policy === "STRICT" ? new Set([pref, "transfer", "road"]) : null;
      const edgeOk = (e: Edge) => !allowed || allowed.has(e.transport_mode);

      const weight = (u: string, e: Edge) => {
        const pId = this.G.nodes.get(e.to)!.physical_id;
        const uPid = this.G.nodes.get(u)!.physical_id;
        let threat = e.base_threat ?? 0.05;
        let scenarioDelay = 0;
        const dis = disruptions[pId];
        if (dis) { threat = Math.max(threat, dis.threat); scenarioDelay += dis.delay; }
        const ml = this.mlDelay(uPid, pId, e.transport_mode, threat);
        const t = e.baseline_time;
        if (persona === "FASTEST") return t + scenarioDelay + ml * 0.5;
        if (persona === "SAFEST") return (t + scenarioDelay + ml * 1.5 + (dis ? 1000 : 0)) * (1 + threat * 20);
        const effTime = t + scenarioDelay + ml * 0.8;
        const effRisk = threat * 50 + (dis ? 500 : 0);
        return effTime * 0.35 + (e.cost / 150) * 0.4 + effRisk * 0.25;
      };

      const path = this.dijkstra(sV, dV, removed, edgeOk, weight);
      if (!path) continue;

      const legs: any[] = [];
      let totalTime = 0, totalCost = 0, maxThreat = 0, totalMl = 0;
      const trace = {
        eta: { transit: 0, transfer: 0, scenario: 0, ml_delay: 0 },
        cost: { transit: 0, transfer: 0, scenario: 0 },
        risk: { baseline: 0, scenario: 0 },
      };
      for (let i = 0; i < path.length - 1; i++) {
        const u = path[i]!, v = path[i + 1]!;
        const e = this.G.adj.get(u)!.get(v)!;
        const un = this.G.nodes.get(u)!, vn = this.G.nodes.get(v)!;
        const mode = e.transport_mode;
        let lTime = e.baseline_time; const lCost = e.cost;
        let lThreat = e.base_threat ?? 0.05;
        let lNews = e.base_news ?? "Standard conditions";
        let lSource = "FALLBACK";
        const dis = disruptions[vn.physical_id];
        if (dis) {
          lTime += dis.delay; lThreat = Math.max(lThreat, dis.threat); lNews = dis.reason; lSource = "SCENARIO";
          trace.eta.scenario += dis.delay;
          trace.risk.scenario = Math.max(trace.risk.scenario, lThreat);
          trace.cost.scenario += lCost * 0.1;
        }
        const legMl = this.mlDelay(un.physical_id, vn.physical_id, mode, lThreat);
        totalMl += legMl;
        const carf = this.carf.explainFilter(lThreat, lNews, mode);
        if (e.type === "transfer") { trace.eta.transfer += lTime; trace.cost.transfer += lCost; }
        else { trace.eta.transit += lTime; trace.cost.transit += lCost; trace.risk.baseline = Math.max(trace.risk.baseline, lThreat); }
        totalTime += lTime; totalCost += lCost; maxThreat = Math.max(maxThreat, lThreat);
        legs.push({
          from: un.physical_id, from_name: un.display_name, to: vn.physical_id, to_name: vn.display_name,
          mode: mode.toUpperCase(), type: e.type, eta: r1(lTime), cost: r2(lCost), threat: r2(lThreat),
          predicted_delay: r1(legMl), carf_audit: carf, reason: lNews, intel_source: lSource,
        });
      }
      trace.eta.ml_delay = r1(totalMl);
      for (const k of ["transit", "transfer", "scenario"] as const) { trace.eta[k] = r1(trace.eta[k]); trace.cost[k] = r2(trace.cost[k]); }
      trace.risk.baseline = r2(trace.risk.baseline); trace.risk.scenario = r2(trace.risk.scenario);
      if (totalCost > costCeiling || totalTime > maxDelay * 24) continue;

      const reroute = !!scenario && !legs.some((l) => l.to in disruptions);
      candidates.push({
        persona, primary_mode: "MULTIMODAL", legs,
        adjusted_eta: r1(totalTime), total_cost: r2(totalCost), threat_level: r2(maxThreat),
        predicted_ml_delay: r1(totalMl), audit_trace: trace,
        explanation: this.forensic(persona, trace, maxThreat),
        ai_decision: {
          persona, risk_score_pct: r1(maxThreat * 100), adjusted_eta_hours: r1(totalTime),
          total_cost_usd: r2(totalCost), predicted_delay_hours: r1(totalMl),
          carf_false_alarms_rejected: legs.filter((l) => l.carf_audit.false_alarm_rejected).length,
          reroute_active: reroute, scenario_bypassed: reroute ? scenario!.name : null,
          rationale: this.rationale(persona, trace, maxThreat, r1(totalMl), reroute, scenario),
        },
        override_applied: !!(avoid.size || costCeiling < 999999 || reroute),
      });
    }
    if (!candidates.length) return { error: "No valid multimodal route found under current strategic constraints." };

    const key = (x: any): number[] => scenario
      ? [x.legs.some((l: any) => l.to in disruptions) ? 1 : 0, x.threat_level, x.adjusted_eta]
      : [x.adjusted_eta, x.threat_level];
    const sorted = [...candidates].sort((a, b) => {
      const ka = key(a), kb = key(b);
      for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i]! - kb[i]!;
      return 0;
    });
    const seen = new Set<string>(); const final: any[] = [];
    for (const c of sorted) {
      const sig = c.legs.map((l: any) => l.to).join("|");
      if (!seen.has(sig)) { seen.add(sig); final.push(c); }
    }
    return {
      origin: req.source, destination: req.destination,
      active_scenario: scenario ? scenario.name : null,
      active_disruptions: Object.keys(disruptions),
      recommendations: final.slice(0, 3),
    };
  }

  private rationale(persona: string, trace: any, threat: number, ml: number, reroute: boolean, s: Scenario | null) {
    if (reroute && s) return `Strategic Disruption Reroute: Active threat '${s.name}' bypassed. Routing deflected around high-risk chokepoint, mitigating +${s.delay_hours}h scenario delay while preserving p85 delay bounds (${ml}h).`;
    if (persona === "FASTEST") return `Velocity Priority: Selected for lowest transit time (${trace.eta.transit}h transit + ${trace.eta.transfer}h transfer). ML model anticipates ${ml}h p85 delay buffer across legs.`;
    if (persona === "SAFEST") return `Maximum Resilience: Route maintains a low risk exposure (${r1(threat * 100)}%) by filtering volatile corridors through CARF modal screening. ML predicted delay is controlled at ${ml}h.`;
    const cost = (trace.cost.transit + trace.cost.transfer).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `Optimal Pareto Balance: Balances landed freight cost ($${cost}) against ${r1(trace.eta.transit + trace.eta.transfer)}h ETA. ML quantile delay factor of ${ml}h factored into total reliability.`;
  }

  private forensic(persona: string, trace: any, threat: number) {
    const cost = trace.cost.transit + trace.cost.transfer + trace.cost.scenario;
    const transfers = Math.round(trace.eta.transfer / 4);
    if (persona === "FASTEST") return `Velocity-optimized. Mode handoffs applied to reduce transit time by ${r1(trace.eta.transit * 0.2)}h vs pure surface transport. ${transfers} strategic transfers enforced.`;
    if (persona === "SAFEST") return `Resilience-optimized. Path selection reduces risk exposure by ${Math.round((1 - threat) * 100)}% by bypassing volatile corridors. Lead-time integrity prioritized over cost.`;
    return `Economic-optimized. Multimodal balance reduces total landed cost by ${Math.round(cost * 0.15)}% vs premium express AIR, while maintaining defensible lead times.`;
  }
}
