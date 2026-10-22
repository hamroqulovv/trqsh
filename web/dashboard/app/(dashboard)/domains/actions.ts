"use server";

import { revalidatePath } from "next/cache";
import { api, type DnsInstructions } from "@/lib/api";
import { errorMessage, type ActionResult } from "@/lib/action-result";

export interface ReserveState {
  error?: string;
  ok?: boolean;
  /** The subdomain just reserved, so the UI can name it in a toast. */
  subdomain?: string;
}

export async function reserveSubdomainAction(_prev: ReserveState, fd: FormData): Promise<ReserveState> {
  const sub = String(fd.get("subdomain") || "").trim().toLowerCase();
  if (!sub) return { error: "Enter a subdomain." };
  try {
    await api.reserveSubdomain(sub);
    revalidatePath("/domains");
    return { ok: true, subdomain: sub };
  } catch (e) {
    return { error: errorMessage(e, "Could not reserve subdomain.") };
  }
}

export async function releaseSubdomainAction(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing subdomain." };
  try {
    await api.releaseSubdomain(id);
    revalidatePath("/domains");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Could not release the subdomain.") };
  }
}

export interface AddDomainState {
  error?: string;
  dns?: DnsInstructions;
  domain?: string;
}

export async function addDomainAction(_prev: AddDomainState, fd: FormData): Promise<AddDomainState> {
  const domain = String(fd.get("domain") || "").trim().toLowerCase();
  if (!domain.includes(".")) return { error: "Enter a valid domain (e.g. app.example.com)." };
  try {
    const r = await api.addDomain(domain);
    revalidatePath("/domains");
    return { dns: r.dns_instructions, domain: r.domain.domain };
  } catch (e) {
    return { error: errorMessage(e, "Could not add domain.") };
  }
}

export async function verifyDomainAction(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing domain." };
  try {
    const d = await api.verifyDomain(id);
    revalidatePath("/domains");
    return d?.verified_at
      ? { ok: true, message: "Domain verified." }
      : { ok: false, error: "DNS records were not found yet. Changes can take a few minutes to propagate." };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Could not verify the domain.") };
  }
}
