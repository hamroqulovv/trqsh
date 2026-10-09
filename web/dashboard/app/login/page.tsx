import type { Metadata } from "next";
import { getOAuthProviders } from "@/lib/api";
import { safeDashboardNextPath } from "@/lib/paths";
import { LoginForm } from "./form";

export const metadata: Metadata = {
  title: "Sign in · trqsh",
  description:
    "Sign in to your trqsh workspace. Manage tunnels, domains and connected devices.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [params, providers] = await Promise.all([
    searchParams,
    getOAuthProviders(),
  ]);
  return (
    <LoginForm
      next={safeDashboardNextPath(params.next || "/")}
      providers={providers}
    />
  );
}
