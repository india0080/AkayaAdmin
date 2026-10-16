"use client";

import { httpsCallable } from "firebase/functions";
import { fns } from "@/lib/firebase";
import { normaliseError } from "@/lib/apiErrors";

export { AdminApiError, normaliseError } from "@/lib/apiErrors";
export type { ApiErrorKind } from "@/lib/apiErrors";

/// The one way to call an admin Cloud Function. Failures always surface as
/// AdminApiError with an operator-readable message — never a raw
/// FirebaseError or stack trace.
export async function callAdmin<TRes = unknown, TReq = Record<string, unknown>>(
  name: string,
  data?: TReq,
): Promise<TRes> {
  try {
    const res = await httpsCallable<TReq, TRes>(fns, name)(data as TReq);
    return res.data;
  } catch (e) {
    throw normaliseError(e);
  }
}
