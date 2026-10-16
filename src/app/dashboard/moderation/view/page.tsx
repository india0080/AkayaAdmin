import { Suspense } from "react";
import ModerationCasePage from "@/features/support/ModerationCasePage";

// /dashboard/moderation/view?id=… — query parameter for a single case.
// Suspense is required around useSearchParams.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ModerationCasePage />
    </Suspense>
  );
}
