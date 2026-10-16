"use client";

import { httpsCallable } from "firebase/functions";
import { fns } from "@/lib/firebase";
import { AdminApiError, normaliseError } from "@/lib/apiErrors";
import { DEMO_MODE } from "@/lib/demo/flag";

export { AdminApiError, normaliseError } from "@/lib/apiErrors";
export type { ApiErrorKind } from "@/lib/apiErrors";

/// The one way to call an admin Cloud Function. Failures always surface as
/// AdminApiError with an operator-readable message — never a raw
/// FirebaseError or stack trace.
export async function callAdmin<TRes = unknown, TReq = Record<string, unknown>>(
  name: string,
  data?: TReq,
): Promise<TRes> {
  if (DEMO_MODE) {
    const { realFixture } = await import("@/lib/demo/fixtures");
    const res = realFixture(name, data as Record<string, unknown> | undefined);
    if (res === undefined) throw new AdminApiError("unavailable", "demo", `Demo mode: no sample data for ${name}.`);
    return res as TRes;
  }
  try {
    const res = await httpsCallable<TReq, TRes>(fns, name)(data as TReq);
    return res.data;
  } catch (e) {
    throw normaliseError(e);
  }
}
