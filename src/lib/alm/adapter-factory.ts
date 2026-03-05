/** ALM adapter factory */

import type { AlmTarget } from "@/types/signoff";
import type { AlmAdapter } from "./adapter-interface";

/** Get the appropriate adapter for a target system */
export async function getAlmAdapter(target: AlmTarget): Promise<AlmAdapter> {
  switch (target) {
    case "JIRA": {
      const { JiraAdapter } = await import("./jira-adapter");
      return new JiraAdapter();
    }
    case "AZURE_DEVOPS": {
      const { AzureDevOpsAdapter } = await import("./azure-devops-adapter");
      return new AzureDevOpsAdapter();
    }
    case "SAP_SOLMAN": {
      const { SapCloudAlmAdapter } = await import("./sap-cloud-alm-adapter");
      return new SapCloudAlmAdapter();
    }
    case "CSV": {
      const { CsvAdapter } = await import("./csv-adapter");
      return new CsvAdapter();
    }
    default:
      throw new Error(`Unsupported ALM target: ${target as string}`);
  }
}
