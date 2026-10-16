import { Suspense } from "react";
import PaymentDetailPage from "@/features/revenue/PaymentDetailPage";

// /dashboard/payments/view?id=… — query parameter, not a dynamic segment,
// because the console is a static export. Suspense wraps useSearchParams.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <PaymentDetailPage />
    </Suspense>
  );
}
