import { Suspense } from "react";
import ModelDetailPage from "@/features/ai/ModelDetailPage";

// /dashboard/openrouter/view?id=… — query parameter for static export.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ModelDetailPage />
    </Suspense>
  );
}
