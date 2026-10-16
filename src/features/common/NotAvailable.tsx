"use client";

import Link from "next/link";
import { EmptyState, PageHeader } from "@/ui";

/// Placeholder for routes whose backend callable is not deployed in this
/// release. Replaces a page that would otherwise fail on every call.
export default function NotAvailable({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState
        title="Not available in this release"
        icon="lock"
        action={<Link href="/dashboard" className="text-accent-text underline">Back to Overview</Link>}
      >
        This page&apos;s backend is not part of the current deployment.
      </EmptyState>
    </>
  );
}
