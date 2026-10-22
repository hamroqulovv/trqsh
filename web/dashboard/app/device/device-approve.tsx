"use client";

import { useActionState } from "react";
import { ArrowRight, CheckCircle2, MonitorSmartphone } from "lucide-react";
import { approveDeviceAction, type ApproveState } from "./actions";
import { buttonVariants, Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dashboardPath } from "@/lib/paths";

/** The approve step for a signed-in user: confirm the code shown in the desktop
 *  app, which links the polling device to this account. */
export function DeviceApprove({ code }: { code: string }) {
  const [state, action, pending] = useActionState<ApproveState, FormData>(approveDeviceAction, {});

  if (state.ok) {
    return (
      <div role="status" className="rise-sm flex flex-col items-center gap-4 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-page">
          <CheckCircle2 className="draw-icon h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <p className="font-medium">Device connected</p>
          <p className="mt-1 text-sm text-secondary">
            You can close this tab and return to the trqsh app. It&apos;s signing you in now.
          </p>
        </div>
        <a href={dashboardPath("/")} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Open the dashboard <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-lg border border-border bg-accent/50 p-3 text-sm text-secondary">
        <MonitorSmartphone className="mt-0.5 h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />
        A device is asking to sign in to your trqsh account. Confirm the code it&apos;s showing.
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="user_code" className="text-sm font-medium">
          Device code
        </label>
        <Input
          id="user_code"
          name="user_code"
          defaultValue={code}
          placeholder="WDJB-MJHT"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={!!state.error}
          aria-describedby={state.error ? "user_code_error" : undefined}
          className="h-11 text-center font-mono text-lg uppercase tracking-widest sm:h-11"
          required
        />
      </div>
      {state.error && (
        <p id="user_code_error" role="alert" className="text-sm font-medium">
          {state.error}
        </p>
      )}
      <Button type="submit" loading={pending}>
        {pending ? "Approving…" : "Approve device"}
      </Button>
    </form>
  );
}
