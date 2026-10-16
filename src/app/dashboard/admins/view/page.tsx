import { Suspense } from "react";
import AdminDetailPage from "@/features/iam/AdminDetailPage";

// /dashboard/admins/view?uid=… — query parameter for static export.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <AdminDetailPage />
    </Suspense>
  );
}
