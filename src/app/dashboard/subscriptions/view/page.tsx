import { Suspense } from "react";
import SubscriptionDetailPage from "@/features/revenue/SubscriptionDetailPage";

// /dashboard/subscriptions/view?uid=… — query parameter, not a dynamic
// segment, because the console is a static export. Suspense is required
// around useSearchParams.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <SubscriptionDetailPage />
    </Suspense>
  );
}
