import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/cities")({
  server: {
    handlers: {
      GET: async () => {
        const { LOCATIONS } = await import("@/lib/engine");
        return Response.json(LOCATIONS);
      },
    },
  },
});
