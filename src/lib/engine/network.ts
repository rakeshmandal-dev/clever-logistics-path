// Port of backend/engine/multimodal_network.py (split-node multimodal graph)
import hubsJson from "./data/canonical_hubs.json";

export interface Hub {
  id: string; display_name: string; aliases: string[]; type: string; modes: string[];
  lat: number; lon: number; country: string; parent_city?: string; importance?: number;
  connections?: { to: string; mode: string }[];
}
export interface VNode { id: string; physical_id: string; display_name: string; type: string; mode: string }
export interface Edge {
  to: string; baseline_time: number; distance: number; transport_mode: string;
  type: "transit" | "transfer"; cost: number; base_threat?: number; base_news?: string;
}

export const HUBS = hubsJson as unknown as Hub[];

export const MODE_PROFILES: Record<string, { speed: number; cost_per_km: number }> = {
  road: { speed: 80, cost_per_km: 1.2 },
  rail: { speed: 60, cost_per_km: 0.5 },
  air: { speed: 800, cost_per_km: 15.0 },
  sea: { speed: 35, cost_per_km: 0.15 },
};

const TRANSFER: Record<string, { delay: number; cost: number }> = {
  port_to_rail: { delay: 8, cost: 180 },
  road_to_air: { delay: 6, cost: 150 },
  road_to_sea: { delay: 14, cost: 250 },
  default: { delay: 4, cost: 100 },
};

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371, r = Math.PI / 180;
  const dlat = (lat2 - lat1) * r, dlon = (lon2 - lon1) * r;
  const a = Math.sin(dlat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dlon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function travelTime(dist: number, mode: string) {
  const speed = MODE_PROFILES[mode]?.speed ?? 50;
  return mode === "road" ? dist / (speed * 0.85) : dist / speed;
}

export class Graph {
  nodes = new Map<string, VNode>();
  adj = new Map<string, Map<string, Edge>>();
  addEdge(u: string, v: string, e: Omit<Edge, "to">) {
    this.adj.get(u)!.set(v, { to: v, ...e });
  }
  hasEdge(u: string, v: string) { return this.adj.get(u)?.has(v) ?? false; }
  edgeCount() { let n = 0; for (const m of this.adj.values()) n += m.size; return n; }
}

export function createMultimodalNetwork(): Graph {
  const G = new Graph();
  const lookup = new Map(HUBS.map((h) => [h.id, h]));
  for (const h of HUBS) for (const m of h.modes) {
    const id = `${h.id}:${m}`;
    G.nodes.set(id, { id, physical_id: h.id, display_name: h.display_name, type: h.type, mode: m });
    G.adj.set(id, new Map());
  }
  for (const h of HUBS) {
    const ms = h.modes;
    for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
      const m1 = ms[i]!, m2 = ms[j]!;
      let key = "default";
      if (h.type === "port" && (m1 === "rail" || m2 === "rail")) key = "port_to_rail";
      else if (h.type === "airport" && (m1 === "road" || m2 === "road")) key = "road_to_air";
      else if (h.type === "port" && (m1 === "road" || m2 === "road")) key = "road_to_sea";
      const p = TRANSFER[key]!;
      const e = { baseline_time: p.delay, distance: 0.1, transport_mode: "transfer", type: "transfer" as const, cost: p.cost };
      G.addEdge(`${h.id}:${m1}`, `${h.id}:${m2}`, e);
      G.addEdge(`${h.id}:${m2}`, `${h.id}:${m1}`, e);
    }
  }
  for (const h of HUBS) for (const c of h.connections ?? []) {
    const u = `${h.id}:${c.mode}`, v = `${c.to}:${c.mode}`;
    const h2 = lookup.get(c.to);
    if (G.nodes.has(u) && G.nodes.has(v) && h2) {
      const d = haversine(h.lat, h.lon, h2.lat, h2.lon);
      G.addEdge(u, v, { baseline_time: travelTime(d, c.mode), distance: Math.round(d * 10) / 10, transport_mode: c.mode, type: "transit", cost: d * MODE_PROFILES[c.mode]!.cost_per_km });
    }
  }
  for (let i = 0; i < HUBS.length; i++) {
    const h1 = HUBS[i]!;
    if (!h1.modes.includes("road")) continue;
    for (let j = i + 1; j < HUBS.length; j++) {
      const h2 = HUBS[j]!;
      if (!h2.modes.includes("road")) continue;
      const d = haversine(h1.lat, h1.lon, h2.lat, h2.lon);
      if (d < 200) {
        const u = `${h1.id}:road`, v = `${h2.id}:road`;
        if (!G.hasEdge(u, v)) {
          const e = { baseline_time: travelTime(d, "road"), distance: Math.round(d * 10) / 10, transport_mode: "road", type: "transit" as const, cost: d * 1.2 };
          G.addEdge(u, v, e);
          G.addEdge(v, u, e);
        }
      }
    }
  }
  return G;
}
