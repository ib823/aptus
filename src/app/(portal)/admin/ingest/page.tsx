import { getCatalogStats } from "@/lib/db/cached-queries";
import { IngestClient } from "@/components/admin/IngestClient";

export default async function IngestPage() {
  const catalog = await getCatalogStats();

  return (
    <IngestClient
      currentVersion="2508"
      counts={{
        scopeItems: catalog.scopeItems,
        processSteps: catalog.processSteps,
        configActivities: catalog.configActivities,
      }}
    />
  );
}
