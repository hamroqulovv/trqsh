import { dump, load } from "js-yaml";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

// Serve the API contract with this deployment's public origin. Swagger's
// requests must never point at a development URL embedded in the source spec.
export async function GET() {
  const upstream = process.env.TRQSH_API_INTERNAL_URL || site.apiUrl;
  const response = await fetch(`${upstream.replace(/\/$/, "")}/openapi.yaml`, {
    cache: "no-store",
  });
  if (!response.ok) {
    return new Response("API documentation unavailable", { status: 502 });
  }
  const spec = load(await response.text()) as Record<string, unknown>;
  spec.servers = [{ url: `${site.apiUrl.replace(/\/$/, "")}/v1`, description: "Public API" }];
  return new Response(dump(spec), {
    headers: { "Content-Type": "application/yaml; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
