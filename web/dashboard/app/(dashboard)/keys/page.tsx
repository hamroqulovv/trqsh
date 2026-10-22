import { api, safe } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { LoadError } from "@/components/load-error";
import { KeysManager } from "./keys-manager";

export default async function KeysPage() {
  const keys = await safe(api.apiKeys());
  // Newest first.
  keys?.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="API Keys"
        description="Credentials the agent and desktop app use to authenticate."
      />
      {keys === null ? <LoadError what="your API keys" /> : <KeysManager keys={keys} />}
    </div>
  );
}
