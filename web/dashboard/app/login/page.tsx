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
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const [params, providers] = await Promise.all([
    searchParams,
    getOAuthProviders(),
  ]);
  const errors: Record<string, string> = {
    verified_email_required: "Verify your email address with GitHub or Google, then try again.",
    oauth_cancelled: "Sign-in was cancelled. You can try again when ready.",
    oauth_failed: "We could not complete sign-in. Please try again.",
    oauth: "Your sign-in session expired. Please try again.",
    expired: "Your session expired. Please sign in again.",
    provider_mismatch: "This email already has a different GitHub or Google account linked to it. Sign in with the account you used before.",
  };
  return (
    <LoginForm
      next={safeDashboardNextPath(params.next || "/")}
      providers={providers}
      error={params.error ? errors[params.error] : undefined}
    />
  );
}
