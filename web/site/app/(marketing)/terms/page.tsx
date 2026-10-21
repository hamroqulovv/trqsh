import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";
import { termsPolicy } from "@/lib/policies";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The agreement for using hosted trqsh, including accounts, public tunnels, plan limits, manual upgrades, and acceptable use.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return <PolicyPage document={termsPolicy} />;
}
