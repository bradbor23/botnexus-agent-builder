/** The original six personas with bespoke builder functions. */
export type BuiltinPersonaId =
  | "software-engineer"
  | "marketing"
  | "finance"
  | "hr"
  | "program-manager"
  | "product-manager";

/** Predefined professional personas for context file generation. */
export type PersonaId =
  | BuiltinPersonaId
  | "researcher"
  | "principal-systems-administrator"
  | "senior-network-engineer"
  | "senior-network-administrator"
  | "chief-information-officer"
  | "chief-technology-officer"
  | "project-manager"
  | "principal-cloud-engineer"
  | "senior-database-administrator"
  | "cybersecurity-analyst";

export const PERSONA_IDS: readonly PersonaId[] = [
  "software-engineer",
  "marketing",
  "finance",
  "hr",
  "program-manager",
  "product-manager",
  "researcher",
  "principal-systems-administrator",
  "senior-network-engineer",
  "senior-network-administrator",
  "chief-information-officer",
  "chief-technology-officer",
  "project-manager",
  "principal-cloud-engineer",
  "senior-database-administrator",
  "cybersecurity-analyst",
];

export type PersonaFieldType = "select" | "multiselect";

export interface PersonaFieldDefinition {
  id: string;
  label: string;
  type: PersonaFieldType;
  options: readonly string[];
  required?: boolean;
}

export interface PersonaDefinition {
  id: PersonaId;
  label: string;
  description: string;
  fields: readonly PersonaFieldDefinition[];
}

/** Optional free-text details that tailor a persona to the individual. */
export interface PersonaPersonalization {
  /** What you specialize in / what the AI should prioritize. */
  focus: string;
  /** How you like to work and communicate. */
  workingStyle: string;
  /** About your projects, domain, company, or constraints. */
  context: string;
}

export const EMPTY_PERSONA_PERSONALIZATION: PersonaPersonalization = {
  focus: "",
  workingStyle: "",
  context: "",
};

export interface PersonaSelection {
  personaId: PersonaId;
  yearsExperience: string;
  fields: Record<string, string | string[]>;
  personalization?: PersonaPersonalization;
}

/** The three persona context files, keyed by id. */
export type PersonaFileKind = keyof PersonaContextFiles;

export const PERSONA_FILE_KINDS: readonly PersonaFileKind[] = ["soul", "memory", "storage"];

export interface PersonaContextFiles {
  soul: string;
  memory: string;
  storage: string;
}

export const EXPERIENCE_YEARS_OPTIONS = [
  "Less than 1 year",
  "1–2 years",
  "3–5 years",
  "6–10 years",
  "11–15 years",
  "16+ years",
] as const;

export function isPersonaId(value: unknown): value is PersonaId {
  return typeof value === "string" && PERSONA_IDS.includes(value as PersonaId);
}
