"use server";

import { api, ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/action-result";

export interface ApproveState {
  ok?: boolean;
  error?: string;
}

// The API answers with its internal error identifiers; people need sentences.
const DEVICE_ERRORS: Record<string, string> = {
  invalid_device_code: "That code isn't valid, or it has already been used. Check the code in the app.",
  expired_token: "That code has expired. Start the sign-in again from the app to get a new one.",
};

/** Approve a desktop/CLI device-authorization request for the signed-in account.
 *  The API mints an API key for the org and hands it to the polling device. */
export async function approveDeviceAction(_prev: ApproveState, formData: FormData): Promise<ApproveState> {
  const code = String(formData.get("user_code") || "").trim().toUpperCase();
  if (!code) return { error: "Enter the code shown in the app." };
  try {
    await api.approveDevice(code);
    return { ok: true };
  } catch (e) {
    const known = e instanceof ApiError ? DEVICE_ERRORS[e.message] : undefined;
    return { error: known ?? errorMessage(e, "Could not approve this device.") };
  }
}
