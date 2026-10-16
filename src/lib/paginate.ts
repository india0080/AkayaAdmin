// Cursor pagination for the admin panel's growing collections (D4).
//
// ## What was wrong
//
// The Inbox and Moderation pages read their whole collection:
//
//     getDocs(query(collection(db, "contact_requests"), orderBy("createdAt", "desc")))
//
// No limit. Every contact message ever received, downloaded on every page view,
// billed per document read. It works at 50 messages and falls over at 50,000 —
// and it fails by getting slower and more expensive, not by erroring, so nobody
// notices until the bill or the spinner does.
//
// Users and Activity had `limit(200)`, which is bounded but truncates in silence:
// there was no way to reach user 201 and nothing on screen said so.
//
// ## Why cursors rather than offsets
//
// Firestore has no offset that skips reads — `startAt(n)` still charges for the
// documents it skips. `startAfter(lastDoc)` is the only form that gets cheaper
// per page rather than more expensive. It also cannot skip or duplicate a row
// when something is inserted mid-browse, which an offset can.
//
// ## Counts are queried, not derived
//
// The badge counts ("3 unread") used to be `items.filter(…).length` over a
// fully-loaded collection, which was correct only because everything was loaded.
// Under pagination that would silently become "unread in the first 25", so the
// counts now come from getCountFromServer — a real aggregate over the whole
// collection that bills one read, not one per document.

import {
  collection,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentData,
  type OrderByDirection,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type WhereFilterOp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

/// Rows per page. 25 fills a screen without a second scroll on the smallest
/// laptop the panel is used on, and keeps a cold page load to 25 document reads.
export const PAGE_SIZE = 25;

export type Cursor = QueryDocumentSnapshot<DocumentData> | null;

export interface Page<T> {
  items: T[];
  /// Pass to the next call. Null when there is nothing left.
  cursor: Cursor;
  /// True when a further page probably exists. Derived from a full page being
  /// returned, so it can be one false positive at the exact boundary — the
  /// alternative is over-fetching one document on every page forever.
  hasMore: boolean;
}

export interface PageRequest {
  /// Collection name, e.g. "contact_requests".
  path: string;
  /// Field to sort on. Documents missing it are invisible to the query — see the
  /// note in fetchPage.
  orderByField: string;
  direction?: OrderByDirection;
  /// Server-side equality filter. Must be applied here rather than in the client:
  /// filtering one page in JavaScript shows "the pending items in this page", not
  /// the pending items.
  filter?: { field: string; op: WhereFilterOp; value: unknown };
  cursor?: Cursor;
  pageSize?: number;
}

/// Reads one page, newest first by default.
///
/// ⚠️ A Firestore `orderBy` silently excludes documents that lack the field. Any
/// row written without `createdAt` is invisible to these queries — that is a
/// property of Firestore, not of this function, and the writers all set it
/// (functions/src/index.ts uses serverTimestamp on every public submission).
export async function fetchPage<T>(
  req: PageRequest,
  map: (snap: QueryDocumentSnapshot<DocumentData>) => T,
): Promise<Page<T>> {
  const size = req.pageSize ?? PAGE_SIZE;
  const constraints: QueryConstraint[] = [];
  if (req.filter) {
    constraints.push(where(req.filter.field, req.filter.op, req.filter.value));
  }
  constraints.push(orderBy(req.orderByField, req.direction ?? "desc"));
  if (req.cursor) constraints.push(startAfter(req.cursor));
  constraints.push(limit(size));

  const snap = await getDocs(query(collection(db, req.path), ...constraints));
  // An empty result served from the local cache while the server is
  // unreachable is not "no rows": surface it as a failure so an offline
  // operator never reads it as "nothing pending".
  if (snap.empty && snap.metadata.fromCache) {
    throw new Error("Server unreachable; the empty result came from the local cache.");
  }
  return {
    items: snap.docs.map(map),
    cursor: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null,
    hasMore: snap.docs.length === size,
  };
}

/// Total matching documents, from the server aggregate.
///
/// Returns null on failure rather than 0: a count query needs an index, and a
/// missing index must not render as "0 unread" — that is a wrong answer dressed
/// as a real one. Callers show nothing at all when this is null.
export async function countDocs(
  path: string,
  filter?: { field: string; op: WhereFilterOp; value: unknown },
): Promise<number | null> {
  try {
    const constraints: QueryConstraint[] = filter
      ? [where(filter.field, filter.op, filter.value)]
      : [];
    const snap = await getCountFromServer(
      query(collection(db, path), ...constraints),
    );
    return snap.data().count;
  } catch (err) {
    console.error(`[paginate] count failed for ${path}`, err);
    return null;
  }
}
