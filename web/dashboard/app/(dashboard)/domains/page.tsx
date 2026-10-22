import { api, safe } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { LoadError } from "@/components/load-error";
import { DomainsManager } from "./domains-manager";

const BASE_DOMAIN = process.env.NEXT_PUBLIC_TRQSH_BASE_DOMAIN || "trqsh.uz";

export default async function DomainsPage() {
  const [subdomains, domains] = await Promise.all([safe(api.subdomains()), safe(api.domains())]);
  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Domains"
        description="Reserved subdomains and custom domains for your tunnels."
      />
      {subdomains === null || domains === null ? (
        <LoadError what="your domains" />
      ) : (
        <DomainsManager subdomains={subdomains} domains={domains} baseDomain={BASE_DOMAIN} />
      )}
    </div>
  );
}
