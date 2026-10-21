import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";
import { privacyPolicy } from "@/lib/policies";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How trqsh processes account data, tunnel traffic, local captures, browser storage, and privacy requests.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return <PolicyPage document={privacyPolicy} />;
}
