import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";
import { acceptableUsePolicy } from "@/lib/policies";

export const metadata: Metadata = {
  title: "Acceptable Use",
  description: "The rules for responsible trqsh tunnels and how to report abuse or a security vulnerability to hello@trqsh.uz.",
  alternates: { canonical: "/acceptable-use" },
};

export default function AcceptableUsePage() {
  return <PolicyPage document={acceptableUsePolicy} />;
}
