import type { Metadata } from "next";
import Link from "next/link";
import { Lock, Unlock, Download, ArrowRight } from "lucide-react";
import { loadOpenApi, type ApiOperation, type ApiSchema } from "@/lib/openapi";
import { CodeBlock } from "@/components/code-block";
import { cn } from "@/lib/utils";
import { site } from "@/lib/site";
import { DocsToc } from "@/components/docs-toc";
import { DocsBreadcrumb } from "@/components/docs-breadcrumb";

export const metadata: Metadata = {
  title: "Control API reference",
  description: "Cloud endpoints, Bearer authentication, parameters, request/response schemas and integration examples.",
};
const METHOD_STYLES: Record<string, string> = {
  GET: "bg-series-2/15 text-series-2",
  POST: "bg-series-1/15 text-series-1",
  PUT: "bg-series-3/20 text-serious",
  PATCH: "bg-series-3/20 text-serious",
  DELETE: "bg-critical/15 text-critical",
};
export default function ApiReferencePage() {
  const spec = loadOpenApi();
  if (!spec) return (
    <div className="py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Control API reference</h1>
      <p className="mt-4 text-secondary">The checked-in API contract could not be loaded. Check lib/openapi.generated.yaml and rebuild the website.</p>
    </div>
  );
  const base = site.apiUrl.replace(/\/$/, "") + "/v1";
  const operationCount = spec.groups.reduce((count, group) => count + group.operations.length, 0);
  return (
    <div className="docs-page-grid" id="docs-top">
      <div className="min-w-0">
        <DocsBreadcrumb slug="api" />
        <header className="docs-article-header">
        <div className="docs-page-meta"><span>Reference</span><span>{operationCount} operations · v{spec.version}</span></div>
        <h1>{spec.title}</h1>
        <p className="docs-lead">
          Manage cloud accounts, credentials, domains and reported usage. To start or stop a tunnel on a computer,
          use the separate <Link href="/docs/local-api" className="text-foreground underline underline-offset-4">local agent API</Link>.
        </p>
        </header>
        <section id="using-the-api" className="mt-7 scroll-mt-24 border-y border-border py-5">
          <h2 className="text-base font-semibold">Connect and authenticate</h2>
          <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">This deployment&apos;s base URL</div>
          <code className="mt-2 block break-all text-sm text-foreground">{base}</code>
          <p className="mt-3 text-sm leading-relaxed text-secondary">
            Append the endpoint path below. Send <code className="text-foreground">Authorization: Bearer YOUR_API_KEY</code> or a dashboard access JWT.
            The same header carries either credential; a local control token does not authenticate here.
          </p>
          <CodeBlock
            label="Shell · authenticated read"
            code={'curl -fsS \\\n  -H "Authorization: Bearer $TRQSH_API_KEY" \\\n  "' + base + '/me"'}
            className="mt-4"
          />
          <CodeBlock
            label="PowerShell · authenticated read"
            code={'$trqshHeaders = @{ Authorization = "Bearer $env:TRQSH_API_KEY" }\nInvoke-RestMethod -Uri "' + base + '/me" -Headers $trqshHeaders'}
            className="mt-3"
          />
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Supply your real key through a private environment variable. /me works with API keys or JWTs;
            /account is a user-profile endpoint intended for dashboard JWTs.
          </p>
        </section>
        <section id="requests-and-errors" className="mt-7 scroll-mt-24">
          <h2 className="text-xl font-semibold tracking-tight">Requests, responses and errors</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-secondary">
            <li>Send JSON bodies with <code>Content-Type: application/json</code>. Replace path placeholders such as <code>{"{id}"}</code> with the returned resource ID.</li>
            <li>Successful DELETE actions commonly return 204 with no body; do not parse them as JSON.</li>
            <li>Resource failures normally return <code>{'{"error":"message"}'}</code>. Check the HTTP status before reading success fields.</li>
            <li>401 means missing/rejected credentials; 403 means a permission, plan or disabled-feature condition; 409 means a conflict; 429 means rate limiting.</li>
            <li>SSE endpoints return <code>text/event-stream</code>. Read streamed event frames and reconnect when necessary.</li>
          </ul>
          <p className="mt-4 text-sm leading-relaxed text-secondary">
            Limits and required fields come from the checked-in contract. Deployed API versions can differ.
            Fetch the deployed OpenAPI document when building a client for a specific server. Development email auth
            and optional Stripe billing endpoints are conditional features.
          </p>
          <a href="/openapi.yaml" className="mt-4 inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4">
            <Download className="h-4 w-4" aria-hidden="true" /> Download deployed OpenAPI
          </a>
        </section>
        <section id="resource-example" className="mt-8 scroll-mt-24">
          <h2 className="text-xl font-semibold tracking-tight">Example: reserve a hostname</h2>
          <CodeBlock
            label="Shell · creates an account resource"
            code={'curl -fsS \\\n  -H "Authorization: Bearer $TRQSH_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"subdomain":"myapp"}\' \\\n  "' + base + '/subdomains"'}
            className="mt-4"
          />
          <p className="mt-3 text-sm leading-relaxed text-secondary">
            A successful reservation returns 201. Start the actual tunnel with <code>/http 3000 --subdomain myapp</code> on the agent.
            Cloud <code>GET /tunnels</code> lists sessions reported by the edge; it does not launch your local app.
          </p>
        </section>
        <div className="mt-10 flex flex-col gap-12">
          {spec.groups.map((group) => (
            <section key={group.anchor} id={group.anchor} className="scroll-mt-24">
              <h2 className="mb-4 border-b border-border pb-2 text-xl font-semibold tracking-tight">{group.name}</h2>
              <div className="flex flex-col gap-4">{group.operations.map((op) => <Operation key={op.id} op={op} />)}</div>
            </section>
          ))}
        </div>
        <section id="schemas" className="mt-12 scroll-mt-24">
          <h2 className="mb-3 text-xl font-semibold tracking-tight">Named schemas</h2>
          <p className="mb-5 text-sm text-secondary">References such as #/components/schemas/Tokens refer to the definitions below. These are JSON Schema definitions, not credential values or example responses.</p>
          <div className="space-y-3">{spec.schemas.map((schema) => (
            <details key={schema.name} id={"schema-" + schema.name} className="scroll-mt-24 border-t border-border py-4">
              <summary className="cursor-pointer break-all font-mono text-sm font-medium">{schema.name}</summary>
              <SchemaDetails schema={schema} />
            </details>
          ))}</div>
        </section>
        <Link href="/docs/local-api" className="mt-8 inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4">
          Local agent API <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <aside className="docs-toc-rail hidden xl:block">
        <DocsToc items={[{ name: "Using the API", anchor: "using-the-api" }, { name: "Requests & errors", anchor: "requests-and-errors" },
          { name: "Resource example", anchor: "resource-example" }, ...spec.groups, { name: "Named schemas", anchor: "schemas" }].map((group) => ({ level: 2, text: group.name, id: group.anchor }))} />
      </aside>
    </div>
  );
}
function SchemaDetails({ schema }: { schema: ApiSchema }) {
  return (
    <div className="mt-3 min-w-0">
      {schema.fields.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-2 text-muted"><tr><th className="px-3 py-2 font-medium">Field</th><th className="px-3 py-2 font-medium">Type</th><th className="px-3 py-2 font-medium">Details</th></tr></thead>
            <tbody>{schema.fields.map((field) => (
              <tr key={field.name} className="border-t border-border align-top">
                <td className="px-3 py-2"><code className="text-foreground">{field.name}</code><span className="mt-1 block text-muted">{field.required ? "required" : "optional"}</span></td>
                <td className="px-3 py-2 font-mono text-secondary">{field.type}</td>
                <td className="min-w-40 px-3 py-2 leading-relaxed text-secondary">{field.description}{field.constraints && <span className="mt-1 block text-muted">{field.constraints}</span>}{!field.description && !field.constraints && "See full definition."}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <CodeBlock label={(schema.name ? schema.name + " · " : "") + "JSON Schema"} code={schema.definition} className="mt-3" />
    </div>
  );
}
function Operation({ op }: { op: ApiOperation }) {
  return (
    <div id={op.id} className="scroll-mt-24 border-t border-border">
      <div className="flex flex-wrap items-center gap-3 py-4">
        <span className={cn("rounded px-2 py-0.5 font-mono text-xs font-semibold", METHOD_STYLES[op.method])}>{op.method}</span>
        <code className="min-w-0 break-all text-sm">{op.path}</code>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted">
          {op.auth ? <Lock className="h-3.5 w-3.5" aria-hidden="true" /> : <Unlock className="h-3.5 w-3.5" aria-hidden="true" />}
          {op.auth ? "Bearer auth" : "No Bearer auth"}
        </span>
      </div>
      <div className="min-w-0 pb-6">
        {op.summary && <h3 className="text-sm font-medium">{op.summary}</h3>}
        {op.description && <p className="mt-2 text-sm leading-relaxed text-secondary">{op.description}</p>}
        {op.params.length > 0 && (
          <div className="mt-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Parameters</h4>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2 text-muted"><tr><th className="px-3 py-2">Name / location</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Details</th></tr></thead>
                <tbody>{op.params.map((parameter) => (
                  <tr key={parameter.in + "-" + parameter.name} className="border-t border-border align-top">
                    <td className="px-3 py-2"><code>{parameter.name}</code><span className="mt-1 block text-muted">{parameter.in} · {parameter.required ? "required" : "optional"}</span></td>
                    <td className="px-3 py-2 font-mono text-secondary">{parameter.type}</td>
                    <td className="min-w-40 px-3 py-2 leading-relaxed text-secondary">{parameter.description}{parameter.constraints && <span className="mt-1 block text-muted">{parameter.constraints}</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
        {op.requestBody && (
          <details className="mt-4 border-t border-border pt-3">
            <summary className="cursor-pointer text-sm font-medium">Request body · {op.requestBody.required ? "required" : "optional"} · {op.requestBody.mediaType}</summary>
            {op.requestBody.schema && <SchemaDetails schema={op.requestBody.schema} />}
          </details>
        )}
        <div className="mt-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Responses</h4>
          <ul className="space-y-2">{op.responses.map((response) => (
            <li key={response.status}>
              <div className="flex items-baseline gap-2 text-sm">
                <code className={cn("rounded px-1.5 py-0.5 text-xs", response.status.startsWith("2") ? "bg-good/15 text-good" : "bg-warning/20 text-serious")}>{response.status}</code>
                <span className="text-secondary">{response.description}</span>
              </div>
              {response.schema && (
                <details className="mt-2 border-t border-border py-3">
                  <summary className="cursor-pointer text-xs font-medium">{response.status} response schema · {response.mediaType}</summary>
                  <SchemaDetails schema={response.schema} />
                </details>
              )}
            </li>
          ))}</ul>
        </div>
      </div>
    </div>
  );
}
