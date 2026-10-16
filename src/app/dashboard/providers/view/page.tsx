import { Suspense } from "react";
import ProviderDetailPage from "@/features/ai/ProviderDetailPage";

// /dashboard/providers/view?id=… — query parameter (static export, unknown
// provider ids cannot be pre-rendered). Suspense wraps useSearchParams.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ProviderDetailPage />
    </Suspense>
  );
}
