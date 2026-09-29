// Port of backend/engine/threat_intelligence.py (patched version).
// - ContrastiveNLPEngine: disaster-over-safe semantic margin, gated by a noise floor.
// - CARFFilter: modal keyword screening per transport mode + explain_filter() audit.
// - ThreatIntelligencePredictor: calibrated p85 worst-case delay surrogate.
import calibration from "./data/calibration_profiles.json";

const STOPWORDS = new Set([
  "a", "an", "the", "of", "in", "on", "at", "to", "for", "and", "or", "by", "is", "are", "was",
  "be", "with", "as", "from", "due", "into", "all", "its", "this", "that", "has", "have", "been",
]);

function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s")) return w.slice(0, -1);
  return w;
}

function embed(text: string): Map<string, number> {
  const v = new Map<string, number>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!raw || STOPWORDS.has(raw)) continue;
    const t = stem(raw);
    v.set(t, (v.get(t) ?? 0) + 1);
  }
  return v;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0, na = 0, nb = 0;
  for (const [k, x] of a) { na += x * x; const y = b.get(k); if (y) dot += x * y; }
  for (const y of b.values()) nb += y * y;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

const DISASTER_ANCHORS = [
  "port closed due to labor strike terminal shutdown",
  "vessel grounding blocks canal shipping halted",
  "severe flooding closes highway roads underwater",
  "hurricane typhoon storm shuts down port operations",
  "train derailment halts rail freight service",
  "airport closed flights cancelled cargo grounded",
  "air traffic control outage grounds flights",
  "severe congestion backlog causing major delays",
  "armed conflict attacks on shipping vessels rerouting",
  "earthquake damages infrastructure logistics disrupted",
  "blockade sanctions disrupt trade corridor",
  "cyberattack disrupts terminal systems",
  "bridge collapse road closure trucks stranded",
];

const SAFE_ANCHORS = [
  "normal operations reported across terminals",
  "traffic flowing smoothly no incidents",
  "port operating at full capacity on schedule",
  "flights departing on schedule normal cargo handling",
  "routine maintenance completed services resumed",
  "no disruptions reported conditions clear",
  "stable weather and steady freight throughput",
];

export class ContrastiveNLPEngine {
  noiseFloor = 0.04;
  calibrationMultiplier = 0.35;
  private disaster = DISASTER_ANCHORS.map(embed);
  private safe = SAFE_ANCHORS.map(embed);

  /** Raw disaster-minus-safe similarity margin (before floor/calibration). */
  margin(newsText: string): number {
    const e = embed(newsText);
    const d = Math.max(...this.disaster.map((x) => cosine(e, x)));
    const s = Math.max(...this.safe.map((x) => cosine(e, x)));
    return d - s;
  }

  getSemanticScore(newsText: string): number {
    if (!newsText || newsText.trim().length < 5) return 0;
    const m = this.margin(newsText);
    if (m <= this.noiseFloor) return 0; // at/below floor => safe
    return Math.min(1, m * this.calibrationMultiplier);
  }
}

export type TransportMode = "air" | "sea" | "rail" | "road" | "transfer";

export interface CarfAudit {
  mode: string;
  raw_nlp_score: number;
  carf_filtered_score: number;
  false_alarm_rejected: boolean;
  reason: string;
}

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

const wordRe = new Map<string, RegExp>();
/** Whole-word match with optional s/es/ed/ing suffix ("port" does not match "airport"). */
function hasWord(text: string, kw: string): boolean {
  let re = wordRe.get(kw);
  if (!re) {
    const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    re = new RegExp(`\\b${esc}(?:s|es|ed|ing)?\\b`, "i");
    wordRe.set(kw, re);
  }
  return re.test(text);
}

export class CARFFilter {
  relevanceMap: Record<string, string[]> = {
    air: ["airport", "flight", "airspace", "aviation", "aircraft", "cargo plane", "air cargo", "runway", "air traffic control", "atc", "air terminal"],
    sea: ["port", "seaport", "vessel", "ship", "shipping lane", "canal", "ocean", "maritime", "dock", "berth", "container ship", "strait", "chokepoint", "anchorage"],
    rail: ["rail", "railway", "track", "locomotive", "train", "freight train", "intermodal rail", "derailment", "rail yard", "switch", "depot"],
    road: ["highway", "truck", "trucking", "hgv", "bridge", "roadway", "freeway", "interstate", "motorway", "corridor", "road closure", "traffic jam", "haulage"],
  };
  systemicTerms = [
    "flood", "typhoon", "hurricane", "storm", "earthquake", "war", "conflict",
    "blockade", "sanctions", "protest", "cyberattack", "curfew", "quarantine", "geopolitical",
  ];

  applyFilter(semanticScore: number, newsContext: string, transportMode: string): number {
    if (semanticScore <= 0 || !newsContext) return 0;
    const mode = transportMode.toLowerCase();
    if (mode === "transfer") return semanticScore * 0.5;
    const news = newsContext.toLowerCase();

    const targetKws = this.relevanceMap[mode] ?? [];
    const hasTarget = targetKws.some((k) => hasWord(news, k));
    const otherKws = Object.entries(this.relevanceMap)
      .filter(([m]) => m !== mode)
      .flatMap(([, k]) => k);
    const hasOther = otherKws.some((k) => hasWord(news, k));
    const hasSystemic = this.systemicTerms.some((t) => hasWord(news, t));

    // False alarm: news targets another mode only, no systemic signal.
    if (hasOther && !hasTarget && !hasSystemic) return 0;
    // Maritime-specific news does not disrupt inland rail/road legs unless it names them.
    if ((mode === "rail" || mode === "road") && ["port", "vessel", "maritime", "dock", "berth"].some((k) => hasWord(news, k))) {
      if (!hasTarget) return 0;
    }
    return semanticScore;
  }

  explainFilter(semanticScore: number, newsContext: string, transportMode: string): CarfAudit {
    const filtered = this.applyFilter(semanticScore, newsContext, transportMode);
    const rejected = semanticScore > 0 && filtered === 0;
    return {
      mode: transportMode,
      raw_nlp_score: round(semanticScore, 3),
      carf_filtered_score: round(filtered, 3),
      false_alarm_rejected: rejected,
      reason: rejected
        ? "CARF modal rejection: Threat targets external transport mode"
        : "Threat relevant to transport mode",
    };
  }
}

interface Profile { floor: number; cap: number }
const PROFILES = calibration as unknown as Record<string, Profile>;
const PRIORS: Record<string, number> = { road: 2.5, sea: 48, air: 12, rail: 18 };
const COND_MULT: Record<string, number> = { Clear: 1, rainy: 1.35, stormy: 1.9 };

export interface DelayPrediction {
  raw_model_prediction: number;
  calibrated_delay: number;
  baseline_systemic_friction: number;
  final_delay_presented: number;
  calibration_reason: string;
  p_quantile: number;
  is_defensible: boolean;
}

export class ThreatIntelligencePredictor {
  /** p85 worst-case delay, calibrated to historical p5 floor / p95 cap per mode. */
  predictWorstCaseDelay(
    _origin: string, _destination: string, transportMode: string,
    legType = "Global_Freight", conditionFlag = "Clear", nlpScore = 0,
  ): DelayPrediction {
    const mode = transportMode.toLowerCase();
    const prior = PRIORS[mode] ?? 12;
    const legMult = legType === "Last_Mile" ? 1 : 1.1;
    const raw = prior * legMult * (COND_MULT[conditionFlag] ?? 1) * (1 + nlpScore * 1.2);
    const profile = PROFILES[mode] ?? { floor: 0, cap: 240 };
    const calibrated = Math.min(Math.max(0, raw), profile.cap);
    const final = Math.max(calibrated, profile.floor);
    let reason = "Optimal Flow";
    if (final === profile.floor && calibrated < profile.floor) reason = `Baseline Operational Friction (Historical p5: ${profile.floor}h)`;
    else if (calibrated < raw) reason = `Operational Cap Applied (Historical p95 Bound: ${profile.cap}h)`;
    else if (raw > profile.floor) reason = "Quantile Disruption Prediction (p85 Risk)";
    return {
      raw_model_prediction: round(raw, 2),
      calibrated_delay: round(calibrated, 2),
      baseline_systemic_friction: profile.floor,
      final_delay_presented: round(final, 2),
      calibration_reason: reason,
      p_quantile: 0.85,
      is_defensible: true,
    };
  }
}
