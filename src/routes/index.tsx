import { createFileRoute } from "@tanstack/react-router";
// Original Supply-Chainer React frontend, imported as-is.
// @ts-expect-error - legacy JSX module without type declarations
import App from "../legacy/App.jsx";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Supplychainer Command Console — Multimodal Route Intelligence" },
      { name: "description", content: "Disruption-aware multimodal route recommendations with CARF threat screening, ML p85 delay prediction and AI route decisions." },
      { property: "og:title", content: "Supplychainer Command Console" },
      { property: "og:description", content: "Disruption-aware multimodal routing with CARF threat screening and ML p85 delay prediction." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <App />;
}
