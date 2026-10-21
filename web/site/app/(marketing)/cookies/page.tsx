import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";
import { cookiesPolicy } from "@/lib/policies";

export const metadata: Metadata = {
  title: "Cookies & Storage",
  description: "What trqsh stores in your browser, how authentication cookies and the theme preference work, and how to clear them.",
  alternates: { canonical: "/cookies" },
};

export default function CookiesPage() {
  return <PolicyPage document={cookiesPolicy} />;
}
