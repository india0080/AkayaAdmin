"use client";

import { User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Admin authorization — the `/admins/{uid}` document is the single source of
// truth (audit item B-11).
//
// ## What this replaces, and why
//
// This gate used to read a build-time `NEXT_PUBLIC_ADMIN_UIDS` env var, which
// made it a THIRD, independent mechanism alongside the two that actually
// enforce anything:
//
//   * firestore.rules — `exists(/databases/$(db)/documents/admins/$(uid))`
//   * Cloud Functions — the same document (functions/lib/shared.js:59-64)
//
// Nothing kept the three in sync, so granting someone admin was a two-step job
// (run `add-admin.js` AND redeploy the panel with their UID baked in), and
// forgetting the second step produced a confusing half-state: the operator
// could sign in and see every page, and every single write failed with a
// permission error that pointed at nothing.
//
// Reading the document instead is not a widening of privilege. Anyone listed in
// `/admins` can ALREADY perform every admin operation through the Firestore SDK
// or a callable — that is precisely what the rules and the functions grant them.
// This only stops the panel's UI from disagreeing with the authority the backend
// actually recognises.
//
// ## Fail-closed
//
// Every failure path returns false: no user, an unreadable document, an offline
// client, a rules rejection. An admin console that opens when it cannot verify
// authorization is worse than one that refuses.
//
// The read itself is permitted for ordinary users by design — the rule is
// `allow read: if isSignedIn() && isOwner(uid)`, so a non-admin reads their own
// (absent) entry and gets a clean "false" rather than a permission error.

/** Resolves whether [user] is an admin, per the `/admins/{uid}` document. */
export async function isAdmin(user: User | null): Promise<boolean> {
  if (!user) return false;
  try {
    const snap = await getDoc(doc(db, "admins", user.uid));
    return snap.exists();
  } catch (e) {
    // Offline, rules rejection, or a transient Firestore fault. Refuse.
    console.error(
      "[akaya-admin] Could not verify admin status against /admins/%s — " +
        "access DENIED. If this account should be an admin, run: " +
        "node akaya_ai/functions/add-admin.js <uid> <email>",
      user.uid,
      e,
    );
    return false;
  }
}
