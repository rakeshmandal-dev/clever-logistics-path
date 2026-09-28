import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/hubs/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = (new URL(request.url).searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 100);
        if (!q) return Response.json({ error: "q is required" }, { status: 422 });
        const { HUBS } = await import("@/lib/engine");
        return Response.json(
          HUBS.filter(
            (h) =>
              h.display_name.toLowerCase().includes(q) ||
              h.aliases.some((a) => a.toLowerCase().includes(q)) ||
              h.country.toLowerCase().includes(q) ||
              h.id.toLowerCase().includes(q),
          ),
        );
      },
    },
  },
});
