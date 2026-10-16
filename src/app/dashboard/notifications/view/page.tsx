import { Suspense } from "react";
import CampaignDetailPage from "@/features/comms/CampaignDetailPage";

// /dashboard/notifications/view?id=… — query parameter (static export).
export default function Page() {
  return (
    <Suspense fallback={null}>
      <CampaignDetailPage />
    </Suspense>
  );
}
