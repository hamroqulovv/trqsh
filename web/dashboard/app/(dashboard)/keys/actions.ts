"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { errorMessage, type ActionResult } from "@/lib/action-result";

export interface CreateKeyState {
  key?: string;
  prefix?: string;
  name?: string;
  error?: string;
}

export async function createKeyAction(_prev: CreateKeyState, formData: FormData): Promise<CreateKeyState> {
  const name = String(formData.get("name") || "").trim() || "default";
  try {
    const k = await api.createApiKey(name);
    revalidatePath("/keys");
    return { key: k.api_key, prefix: k.prefix, name };
  } catch (e) {
    return { error: errorMessage(e, "Could not create key.") };
  }
}

export async function revokeKeyAction(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing key." };
  try {
    await api.revokeApiKey(id);
    revalidatePath("/keys");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Could not revoke the key.") };
  }
}
