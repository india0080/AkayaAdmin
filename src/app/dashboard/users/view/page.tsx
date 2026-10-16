import { Suspense } from "react";
import User360Page from "@/features/customers/User360Page";

// /dashboard/users/view?uid=… — a query parameter, not a dynamic segment,
// because the console is a static export (unknown uids cannot be
// pre-rendered). Suspense is required around useSearchParams.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <User360Page />
    </Suspense>
  );
}
