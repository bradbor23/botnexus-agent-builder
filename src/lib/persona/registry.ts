import type { BuiltinPersonaId, PersonaDefinition, PersonaId } from "./types";
import { EXTENDED_PERSONA_SPECS, getExtendedPersonaSpec } from "./extended-specs";

const PERSONAS: Record<BuiltinPersonaId, PersonaDefinition> = {
  "software-engineer": {
    id: "software-engineer",
    label: "Software Engineer",
    description: "Builds and maintains software with strong engineering practices.",
    fields: [
      {
        id: "specialty",
        label: "Specialty",
        type: "select",
        options: ["Frontend", "Backend", "Full-stack", "DevOps", "Mobile", "Data / ML"],
        required: true,
      },
      {
        id: "languages",
        label: "Primary languages",
        type: "multiselect",
        options: [
          "JavaScript",
          "TypeScript",
          "Python",
          "Java",
          "Go",
          "Rust",
          "C#",
          "Ruby",
          "PHP",
          "Swift",
          "Kotlin",
        ],
        required: true,
      },
      {
        id: "operatingSystems",
        label: "Operating systems",
        type: "multiselect",
        options: ["Windows", "macOS", "Linux"],
        required: true,
      },
      {
        id: "environment",
        label: "Environment",
        type: "select",
        options: ["On-premise", "Cloud", "Hybrid"],
      },
      {
        id: "cloudStack",
        label: "Cloud platforms",
        type: "multiselect",
        options: [
          "Azure (App Service/Functions/AKS)",
          "AWS (Lambda/ECS/EKS)",
          "Google Cloud (Run/GKE)",
          "Azure DevOps",
          "GitHub Actions",
          "Serverless",
          "Managed databases",
        ],
      },
      {
        id: "onPremStack",
        label: "On-premise platforms",
        type: "multiselect",
        options: [
          ".NET / ASP.NET",
          "IIS / Windows Server",
          "SQL Server",
          "Self-hosted PostgreSQL/MySQL",
          "Docker (self-hosted)",
          "Jenkins (on-prem CI)",
          "Linux servers",
        ],
      },
    ],
  },
  marketing: {
    id: "marketing",
    label: "Marketing",
    description: "Plans campaigns, messaging, and growth across channels.",
    fields: [
      {
        id: "focus",
        label: "Marketing focus",
        type: "multiselect",
        options: ["Content", "SEO", "Social media", "Email", "Brand", "Product marketing", "Paid ads"],
        required: true,
      },
      {
        id: "industry",
        label: "Industry",
        type: "select",
        options: ["B2B SaaS", "B2C", "E-commerce", "Agency", "Non-profit", "Other"],
        required: true,
      },
    ],
  },
  finance: {
    id: "finance",
    label: "Finance",
    description: "Handles accounting, analysis, planning, and financial reporting.",
    fields: [
      {
        id: "area",
        label: "Finance area",
        type: "select",
        options: ["Accounting", "FP&A", "Corporate finance", "Investment", "Audit", "Treasury"],
        required: true,
      },
      {
        id: "tools",
        label: "Tools & systems",
        type: "multiselect",
        options: ["Excel", "Google Sheets", "QuickBooks", "NetSuite", "SAP", "Power BI", "Tableau"],
        required: true,
      },
    ],
  },
  hr: {
    id: "hr",
    label: "HR",
    description: "Supports people operations, talent, and organizational health.",
    fields: [
      {
        id: "focus",
        label: "HR focus",
        type: "multiselect",
        options: ["Recruiting", "L&D", "Employee relations", "HR business partner", "Compensation", "Compliance"],
        required: true,
      },
      {
        id: "companySize",
        label: "Company size",
        type: "select",
        options: ["Startup", "SMB", "Mid-market", "Enterprise"],
        required: true,
      },
    ],
  },
  "program-manager": {
    id: "program-manager",
    label: "Program Manager",
    description: "Coordinates cross-team delivery, timelines, and stakeholder alignment.",
    fields: [
      {
        id: "methodology",
        label: "Delivery methodology",
        type: "multiselect",
        options: ["Agile / Scrum", "SAFe", "Waterfall", "Kanban", "Hybrid"],
        required: true,
      },
      {
        id: "domain",
        label: "Program domain",
        type: "select",
        options: ["Software / IT", "Infrastructure", "Business transformation", "Compliance", "Other"],
        required: true,
      },
    ],
  },
  "product-manager": {
    id: "product-manager",
    label: "Product Manager",
    description: "Defines product strategy, roadmap, and outcomes for users and the business.",
    fields: [
      {
        id: "productType",
        label: "Product type",
        type: "select",
        options: ["B2B SaaS", "B2C", "Platform / API", "Hardware", "Marketplace"],
        required: true,
      },
      {
        id: "stage",
        label: "Product stage",
        type: "multiselect",
        options: ["Discovery", "MVP", "Growth", "Mature", "Turnaround"],
        required: true,
      },
    ],
  },
};

/** Maps a data-driven spec to the lighter registry definition shape. */
function specToDefinition(spec: (typeof EXTENDED_PERSONA_SPECS)[number]): PersonaDefinition {
  return {
    id: spec.id,
    label: spec.label,
    description: spec.description,
    fields: spec.fields,
  };
}

export const PERSONA_DEFINITIONS: readonly PersonaDefinition[] = [
  ...Object.values(PERSONAS),
  ...EXTENDED_PERSONA_SPECS.map(specToDefinition),
];

export function getPersonaDefinition(id: PersonaId): PersonaDefinition {
  const builtin = (PERSONAS as Partial<Record<PersonaId, PersonaDefinition>>)[id];
  if (builtin) return builtin;
  const spec = getExtendedPersonaSpec(id);
  if (spec) return specToDefinition(spec);
  throw new Error(`Unknown persona: ${id}`);
}
