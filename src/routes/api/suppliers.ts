import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/suppliers")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { z } = await import("zod");
        const schema = z.object({
          category: z.string().max(100).default("Electronics"),
          current_inventory: z.number().int().default(1000),
          safety_stock: z.number().int().default(1500),
          demand_forecast: z.number().int().default(800),
          scenario: z.string().max(50).nullish(),
        });
        const parsed = schema.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 422 });
        const d = parsed.data;
        const { getDisruptions, getRankedSuppliers, getProcurementAdvice } = await import("@/lib/engine");
        const active = getDisruptions(d.scenario);
        return Response.json({
          suppliers: getRankedSuppliers(d.category, active),
          advice: getProcurementAdvice(d.current_inventory, d.safety_stock, d.demand_forecast),
          active_disruptions: active,
        });
      },
    },
  },
});
