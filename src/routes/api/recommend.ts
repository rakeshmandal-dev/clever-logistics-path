import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/recommend")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { z } = await import("zod");
        const schema = z.object({
          source: z.string().max(200),
          destination: z.string().max(200),
          cargo_type: z.string().max(50).default("general"),
          priority: z.string().max(50).default("normal"),
          budget_sensitivity: z.string().max(50).optional(),
          transport_preference: z.enum(["any", "sea", "air", "rail", "road"]).default("any"),
          routing_policy: z.enum(["STRICT", "PREFERRED"]).default("STRICT"),
          scenario: z.string().max(50).nullish(),
          overrides: z.object({
            avoid_chokepoints: z.array(z.string().max(100)).max(50).optional(),
            cost_ceiling: z.number().optional(),
            max_delay: z.number().optional(),
          }).nullish(),
        });
        const parsed = schema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Invalid request", detail: parsed.error.issues }, { status: 422 });
        const { getRecommender } = await import("@/lib/engine");
        const d = parsed.data;
        return Response.json(getRecommender().recommend({
          source: d.source, destination: d.destination, cargo_type: d.cargo_type, priority: d.priority,
          transport_preference: d.transport_preference, routing_policy: d.routing_policy,
          scenario: d.scenario ?? null,
          overrides: d.overrides ? {
            ...(d.overrides.avoid_chokepoints ? { avoid_chokepoints: d.overrides.avoid_chokepoints } : {}),
            ...(d.overrides.cost_ceiling !== undefined ? { cost_ceiling: d.overrides.cost_ceiling } : {}),
            ...(d.overrides.max_delay !== undefined ? { max_delay: d.overrides.max_delay } : {}),
          } : null,
        }));
      },
    },
  },
});
