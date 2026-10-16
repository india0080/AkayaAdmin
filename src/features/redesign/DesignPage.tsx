"use client";

import { useState, type ReactNode } from "react";
import { PageHeader, Tabs } from "@/ui";
import { SampleTag } from "../insights/widgets";

/// Frame for the redesigned pages: header (+ period buttons), the new
/// overview layout, and the original full-featured page under "Manage" so no
/// existing workflow is lost.
export function DesignPage({ title, description, actions, sample, manage, manageLabel = "Manage", children }: {
  title: string; description: string; actions?: ReactNode; sample?: boolean; manage?: ReactNode; manageLabel?: string; children: ReactNode;
}) {
  const [tab, setTab] = useState("overview");
  return (
    <div className="space-y-4">
      <PageHeader title={title} description={description} actions={<div className="flex flex-wrap items-center gap-2">{sample ? <SampleTag /> : null}{tab === "overview" ? actions : null}</div>} />
      {manage ? <Tabs label={`${title} sections`} value={tab} onChange={setTab} tabs={[{ id: "overview", label: "Overview" }, { id: "manage", label: manageLabel }]} /> : null}
      <div role="tabpanel" className="space-y-4">{tab === "overview" || !manage ? children : manage}</div>
    </div>
  );
}
