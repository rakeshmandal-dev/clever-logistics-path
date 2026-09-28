import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/status")({
  server: {
    handlers: {
      GET: async () => {
        const { HUBS } = await import("@/lib/engine");
        return Response.json({
          ml_trained: true, active_trips: 0, tick: Math.floor(Date.now() / 2000),
          is_supplychainer: true, geo_scope: "Global (Canonical)", hub_count: HUBS.length,
          engine_status: "FULLY OPERATIONAL", hub_registry: "Synchronized",
        });
      },
    },
  },
});
