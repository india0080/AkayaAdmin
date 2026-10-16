import DirectoryPage from "@/features/customers/DirectoryPage";

// Formerly a UID/email lookup with a 200-newest client-side scan. Rebuilt on
// the adminUser callable: server pagination, PII masking by role (Phase 5).
export default function Page() {
  return <DirectoryPage />;
}
