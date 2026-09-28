// Port of backend/engine/scenario_manager.py
export interface Scenario {
  name: string; description: string; affected_nodes: string[];
  threat_level: number; delay_hours: number; reason: string; mode: string;
}
export interface Disruption { delay: number; threat: number; reason: string; source: string }

export const SCENARIOS: Record<string, Scenario> = {
  SUEZ_BLOCK: { name: "Suez Canal Blockage", description: "Critical maritime corridor obstructed by vessel grounding.", affected_nodes: ["CHOKE-SUEZ"], threat_level: 1.0, delay_hours: 240, reason: "Vessel grounding in Canal Narrows. Canal authority estimates 10-day salvage window.", mode: "sea" },
  RED_SEA_CONFLICT: { name: "Red Sea Escalation", description: "Increased regional instability affecting Bab el-Mandeb.", affected_nodes: ["CHOKE-BABEL"], threat_level: 0.85, delay_hours: 72, reason: "Regional conflict escalation. Vessels rerouting via Cape of Good Hope for risk mitigation.", mode: "sea" },
  LA_PORT_STRIKE: { name: "LA Port Strike", description: "Labor dispute causing terminal shutdowns in Los Angeles.", affected_nodes: ["PORT-LOSANGELES", "PORT-LONGBEACH"], threat_level: 0.9, delay_hours: 120, reason: "Terminal labor strike. Picket lines at all major berths. Throughput at 0%.", mode: "sea" },
  CHENNAI_FLOOD: { name: "Chennai Monsoon Flooding", description: "Extreme weather disrupting South India logistics.", affected_nodes: ["PORT-CHENNAI", "HUB-CHENNAI"], threat_level: 0.75, delay_hours: 48, reason: "Severe urban flooding. Inland road access to Port and Logistics Park is underwater.", mode: "road" },
  DUBAI_AIR_CONGESTION: { name: "Dubai Hub Surge", description: "Massive cargo backlog at DXB/DWC.", affected_nodes: ["AIR-DUBAI"], threat_level: 0.65, delay_hours: 24, reason: "Regional cargo surge exceeding ground handling capacity. 48h clearance backlog.", mode: "air" },
  HORMUZ_CLOSURE: { name: "Hormuz Strait Escalation", description: "Strategic maritime choke point tension.", affected_nodes: ["CHOKE-HORMUZ"], threat_level: 1.0, delay_hours: 168, reason: "Strategic naval activity. Vessels holding position at Jebel Ali / Colombo.", mode: "sea" },
};

export function getScenario(id: string | null | undefined): Scenario | null {
  return id && SCENARIOS[id] ? SCENARIOS[id]! : null;
}

export function getDisruptions(id: string | null | undefined): Record<string, Disruption> {
  const s = getScenario(id);
  const out: Record<string, Disruption> = {};
  if (!s) return out;
  for (const n of s.affected_nodes) out[n] = { delay: s.delay_hours, threat: s.threat_level, reason: s.reason, source: "SCENARIO_OVERRIDE" };
  return out;
}

export function getAllScenarios() {
  return Object.entries(SCENARIOS).map(([id, v]) => ({ id, ...v }));
}
