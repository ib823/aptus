/**
 * scripts/time/anchor-cross-cutting.ts
 *
 * For TIME RFT: every ClientRequirement that has NO CustomerProcessRequirementLink
 * is tagged with a `crossCuttingTag` so the classifier can ground it via
 * cross-cutting evidence (project management, risk, security, IT architecture,
 * methodology, data migration, change management, commercial/TCO, legal).
 *
 * Process-anchored requirements (those that DO have a process link) get
 * tag = "PROCESS_ANCHORED" so the column is never NULL for TIME — which
 * lets the coverage report assert 830/830.
 *
 * Deterministic — no LLM. All decisions are derivable from module + section
 * code + lowercased requirement text. Audit-proof.
 */

import { prisma } from "../../src/lib/db/prisma";

const TIME_ASSESSMENT_ID = "cmopnc80z000263fq9zd4cmlw";

interface Categoriser {
  tag: string;
  matches: (req: { module: string; code: string; section: string | null; requirementText: string }) => boolean;
}

const lc = (s: string | null | undefined) => (s ?? "").toLowerCase();

// Order matters: more specific rules first.
const RULES: Categoriser[] = [
  // Section headers (template residue — section/sub-section/Option labels carried into rows)
  {
    tag: "SECTION_HEADER",
    matches: (r) => {
      const t = r.requirementText.trim();
      if (t.length > 80) return false;
      if (/^Option\s*\d+\s*[-–—]/i.test(t)) return true;
      if (/^[A-Z][A-Za-z &\/\-]{2,60}\s+Process(\s*\(.+\))?\s*$/.test(t)) return true;
      if (/^(GL|AP|AR|FA|PR|HR|MM|SD|FI|CO|HCM|AMS|RMK|MFRS|SST|GST|VAT|CF|RONR|CAPEX|OPEX)[ \-_]/.test(t) && t.length < 60) return true;
      if (/^(Customer|Vendor|Material|Bank|Cash|Account|Asset|Asset \w+) Master Data$/i.test(t)) return true;
      if (/^Account (Payable|Receivable)/i.test(t) && t.length < 60) return true;
      if (/^[A-Z][A-Za-z ]{3,40}\s+Data$/.test(t)) return true;
      return false;
    },
  },

  // Reporting (custom + standard reports)
  {
    tag: "REPORTING",
    matches: (r) => {
      const t = lc(r.requirementText);
      return (
        /\breport(s|ing)?\b/.test(t) &&
        !/project\s+report|status\s+report|test\s+report/.test(t) // disambiguate from PM
      );
    },
  },

  // Workflow / approval (cross-cutting BPA-style configuration not anchored to one process)
  {
    tag: "WORKFLOW_APPROVAL",
    matches: (r) => {
      const t = lc(r.requirementText);
      return /\bworkflow\b|approval (mechanism|matrix|workflow|process|hierarchy)|multi[- ]level approval|approver\b|\bapprov(e|ing)\b/.test(t);
    },
  },

  // Integration touchpoints (custom apps + downstream systems)
  {
    tag: "INTEGRATION_TOUCHPOINT",
    matches: (r) => {
      const t = lc(r.requirementText);
      return (
        /\bdwms\b|\bbpa\b|\beardb\b|\be-?arif\b|\bpeople\b portal|\bcofr\b|\bzsmart\b|\bcbs\b|\btrecs\b|\bess\b|\bmss\b/.test(t) ||
        /(integrate|integration|interface) (with|to|between)/.test(t) ||
        /api\b|\brest\b|\bsoap\b|\bsftp\b|message broker/.test(t)
      );
    },
  },

  // Project management — SOW project execution items
  {
    tag: "PROJECT_MGMT",
    matches: (r) => {
      const t = lc(r.requirementText);
      const s = lc(r.section);
      return (
        /project (management|charter|plan|governance|kickoff|kick-off|schedule|risk|issue|status|reporting|control)/.test(t) ||
        /steering committee|stakeholder management|escalation|raid log|raci|deliverable acceptance/.test(t) ||
        /\b(pmo|pmp|pmbok|prince2)\b/.test(t) ||
        s.includes("project") ||
        s.includes("delivery")
      );
    },
  },

  // Methodology — SAP Activate phase deliverables
  {
    tag: "METHODOLOGY",
    matches: (r) => {
      const t = lc(r.requirementText);
      return (
        /sap activate|methodology|fit[- ]?to[- ]?standard|fit gap|prepare phase|explore phase|realize phase|deploy phase|run phase|hypercare/.test(t) ||
        /design workshop|fit-?gap workshop|cutover plan|go[- ]?live|sign[- ]?off process|phase exit/.test(t)
      );
    },
  },

  // Risk + governance
  {
    tag: "RISK_GOVERNANCE",
    matches: (r) => {
      const t = lc(r.requirementText);
      return (
        /\brisk\b|risk management|risk register|risk mitigation|risk assessment/.test(t) ||
        /\bgovernance\b|control framework|sox compliance|internal control|audit trail|audit log|sod\b|segregation of duties/.test(t) ||
        /quality assurance|\bqa\b|quality plan/.test(t)
      );
    },
  },

  // Security overlay (Module H = Security; OR security keywords in any module)
  {
    tag: "SECURITY_OVERLAY",
    matches: (r) => {
      if (r.module === "Security") return true;
      const t = lc(r.requirementText);
      return (
        /\bsecurity\b|access control|authoriz?ation|authentication|sso\b|saml\b|oauth|mfa\b|two[- ]factor|ldap|active directory/.test(t) ||
        /role[- ]based access|rbac|user provisioning|user management|password polic|encryption|tls\b|ssl\b|firewall|penetration test|vulnerability/.test(t) ||
        /data privacy|gdpr|pdpa|personal data|sensitive data masking/.test(t)
      );
    },
  },

  // IT architecture (Module I = IT; OR architecture keywords)
  {
    tag: "IT_ARCHITECTURE",
    matches: (r) => {
      if (r.module === "IT") return true;
      const t = lc(r.requirementText);
      return (
        /infrastructure|architecture|landscape|sizing|capacity planning|disaster recovery|\bdr\b|business continuity|\bbcp\b/.test(t) ||
        /backup|restore|high availability|\bha\b|sla\b|uptime|recovery time objective|\brto\b|recovery point|\brpo\b/.test(t) ||
        /integration platform|middleware|cpi\b|api gateway|btp\b|business technology platform|cloud connector/.test(t) ||
        /environment|tenant|sandbox|quality system|production system|dev\/qa\/prd|three[- ]tier landscape|n\+1|n-1/.test(t)
      );
    },
  },

  // Data migration
  {
    tag: "DATA_MIGRATION",
    matches: (r) => {
      const t = lc(r.requirementText);
      return (
        /data migration|data conversion|legacy data|historical data|cutover data|data load|data extraction|data cleansing|data transformation|data quality/.test(t) ||
        /master data migration|opening balance|opening balances|trial balance load|inventory snapshot|customer master load|vendor master load/.test(t) ||
        /migration cockpit|ltmc|ltmom|\bidoc\b/.test(t)
      );
    },
  },

  // Change management / OCM / training
  {
    tag: "CHANGE_MGMT",
    matches: (r) => {
      const t = lc(r.requirementText);
      return (
        /change management|\bocm\b|organi[sz]ational change|change impact|change readiness|stakeholder analysis|communication plan/.test(t) ||
        /training plan|train[- ]the[- ]trainer|user training|end[- ]user training|key user|super user|knowledge transfer|\bkt\b\b|enablement/.test(t) ||
        /user adoption|adoption metrics/.test(t)
      );
    },
  },

  // Commercial / TCO (Module J = TCO)
  {
    tag: "COMMERCIAL_TCO",
    matches: (r) => {
      if (r.module === "TCO") return true;
      const t = lc(r.requirementText);
      return /total cost of ownership|\btco\b|licen[sc]e cost|subscription fee|maintenance fee|pricing model|commercial model|payment milestone|invoicing schedule/.test(t);
    },
  },

  // Legal / compliance
  {
    tag: "LEGAL_COMPLIANCE",
    matches: (r) => {
      const t = lc(r.requirementText);
      return (
        /\blegal\b|contract|terms and conditions|liability|indemnif|warranty|service level agreement|\bsla\b/.test(t) ||
        /regulatory compliance|regulatory requirement|statutory|compliance reporting/.test(t)
      );
    },
  },
];

const FALLBACK_TAG = "CROSS_CUTTING_OTHER";

async function main() {
  const reqs = await prisma.clientRequirement.findMany({
    where: { assessmentId: TIME_ASSESSMENT_ID },
    select: {
      id: true,
      module: true,
      code: true,
      section: true,
      requirementText: true,
      customerProcessLinks: { select: { id: true }, take: 1 },
    },
  });
  console.log(`[anchor] Loaded ${reqs.length} requirements`);

  const tagDist: Record<string, number> = {};
  let updated = 0;
  let processAnchored = 0;
  let crossCutting = 0;

  for (const r of reqs) {
    let tag: string;
    if (r.customerProcessLinks.length > 0) {
      tag = "PROCESS_ANCHORED";
      processAnchored++;
    } else {
      crossCutting++;
      const matched = RULES.find((rule) => rule.matches(r));
      tag = matched?.tag ?? FALLBACK_TAG;
    }
    tagDist[tag] = (tagDist[tag] ?? 0) + 1;
    await prisma.clientRequirement.update({
      where: { id: r.id },
      data: { crossCuttingTag: tag },
    });
    updated++;
  }

  console.log(`[anchor] Updated ${updated} requirement rows`);
  console.log(`[anchor] Process-anchored: ${processAnchored}`);
  console.log(`[anchor] Cross-cutting   : ${crossCutting}`);
  console.log(`[anchor] Distribution:`);
  for (const [t, n] of Object.entries(tagDist).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${t.padEnd(22)} ${n}`);
  }

  const stillNull = await prisma.clientRequirement.count({
    where: { assessmentId: TIME_ASSESSMENT_ID, crossCuttingTag: null },
  });
  console.log(`[anchor] crossCuttingTag NULL after run: ${stillNull}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });
