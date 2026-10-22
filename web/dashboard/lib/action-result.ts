import { ApiError } from "@/lib/api";
import { friendlyError } from "@/lib/errors";

/** What a mutation hands back to the UI, so it can toast the outcome. */
export interface ActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

/** Friendly copy for known API error codes, otherwise the API's own message. */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return friendlyError(error.code, error.message || fallback).detail;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}
