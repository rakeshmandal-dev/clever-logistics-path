import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/network")({
  server: {
    handlers: {
      GET: async () => {
        const { getRecommender } = await import("@/lib/engine");
        const G = getRecommender().G;
        const nodes = [...G.nodes.values()].map((n) => ({ id: n.id, display_name: n.display_name, type: n.type }));
        const seen = new Set<string>();
        const edges: { source: string; target: string; baseline_time: number }[] = [];
        for (const [u, m] of G.adj) for (const [v, e] of m) {
          const k = [u, v].sort().join("|");
          if (!seen.has(k)) { seen.add(k); edges.push({ source: u, target: v, baseline_time: e.baseline_time }); }
        }
        return Response.json({ nodes, edges });
      },
    },
  },
});
