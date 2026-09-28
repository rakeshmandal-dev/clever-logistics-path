import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/scenarios")({
  server: {
    handlers: {
      GET: async () => {
        const { getAllScenarios } = await import("@/lib/engine");
        return Response.json(getAllScenarios());
      },
    },
  },
});
