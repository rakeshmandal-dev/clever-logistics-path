import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/hubs/")({
  server: {
    handlers: {
      GET: async () => {
        const { HUBS } = await import("@/lib/engine");
        return Response.json(HUBS);
      },
    },
  },
});
