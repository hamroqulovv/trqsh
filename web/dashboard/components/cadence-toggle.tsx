"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Segmented } from "@/components/ui/segmented";

type Cadence = "monthly" | "annual";

/** Monthly / annual pricing. The thumb moves at once; the page follows. */
export function CadenceToggle({ value }: { value: Cadence }) {
  const router = useRouter();
  const [choice, setChoice] = React.useState<Cadence>(value);
  const [, startTransition] = React.useTransition();
  React.useEffect(() => setChoice(value), [value]);

  return (
    <Segmented<Cadence>
      label="Billing period"
      value={choice}
      className="w-fit"
      options={[
        { value: "monthly", label: "Monthly" },
        { value: "annual", label: "Annual" },
      ]}
      onChange={(next) => {
        setChoice(next);
        startTransition(() => router.replace(`/billing?cadence=${next}`, { scroll: false }));
      }}
    />
  );
}
