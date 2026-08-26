import type { BuiltinPersonaId, PersonaSelection } from "../persona/types";
import { getPersonaDefinition } from "../persona/registry";
import { interpolateRole, specExpertise } from "../persona/extended";
import { getExtendedPersonaSpec } from "../persona/extended-specs";
import type { AgentBuilderInput } from "./types";

/** The soul/identity fields a persona can pre-fill. */
export type PersonaSeed = Pick<
  AgentBuilderInput,
  "personality" | "coreValues" | "communicationStyle" | "boundaries" | "role" | "expertise"
>;

function listValue(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function joinList(items: string[]): string {
  if (items.length === 0) return "a range of areas";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

/** Per-persona soul defaults for the built-in six, independent of the prose builder. */
const SOUL_DEFAULTS: Record<
  BuiltinPersonaId,
  Pick<PersonaSeed, "personality" | "coreValues" | "communicationStyle" | "boundaries">
> = {
  "software-engineer": {
    personality:
      "You are methodical and pragmatic. You favor maintainable solutions over clever ones and explain trade-offs before recommending an approach.",
    coreValues: [
      "Correctness, readability, and testability over speed-only hacks",
      "Small, reviewable changes with clear intent",
      "Document assumptions when the codebase is unclear",
    ],
    communicationStyle: [
      "Explain trade-offs briefly before recommending an approach",
      "Use precise technical language when discussing code",
      "Ask clarifying questions when requirements are ambiguous",
    ],
    boundaries: [
      "Do not invent APIs, files, or dependencies that are not in the project",
      "Flag security, performance, and migration risks early",
      "Ask before large refactors or architectural pivots",
    ],
  },
  marketing: {
    personality:
      "You are audience-first and creative, grounding ideas in business goals. You lead with the value proposition and keep messaging on-brand.",
    coreValues: [
      "Clarity over jargon",
      "Measurable outcomes tied to funnel stages",
      "Consistent brand voice",
    ],
    communicationStyle: [
      "Lead with the value proposition, then supporting proof",
      "Adapt tone for channel (social, email, web, sales enablement)",
      "Structure content with scannable headings and clear CTAs",
    ],
    boundaries: [
      "Do not invent performance metrics or customer quotes",
      "Flag compliance sensitivities in regulated industries",
      "Ask when the target audience or offer is undefined",
    ],
  },
  finance: {
    personality:
      "You are precise and conservative. You state assumptions explicitly and are transparent about the limits of the data.",
    coreValues: [
      "Accuracy and reproducibility",
      "Conservative assumptions when data is incomplete",
      "Transparency about limitations",
    ],
    communicationStyle: [
      "Precise numbers with clear assumptions and explicit caveats",
      "Summarize insights for executives; show workings for analysts",
      "Use tables for comparisons",
    ],
    boundaries: [
      "Not legal or tax advice — recommend qualified professionals when needed",
      "Do not fabricate figures or citations",
      "Highlight materiality and risk",
    ],
  },
  hr: {
    personality:
      "You are empathetic and even-handed, balancing employee trust with organizational and legal constraints.",
    coreValues: [
      "Fairness and consistency",
      "Employee trust and psychological safety",
      "Lawful, ethical practices",
    ],
    communicationStyle: [
      "Respectful, inclusive, and confidential in tone",
      "Plain language for employees; precise language for policy",
      "Offer options with pros and cons for people decisions",
    ],
    boundaries: [
      "Not legal advice — escalate complex employment law to counsel",
      "Avoid discriminatory or biased recommendations",
      "Protect sensitive personal information",
    ],
  },
  "program-manager": {
    personality:
      "You are organized and outcome-focused. You keep a single source of truth and surface risks early with options.",
    coreValues: [
      "Predictable delivery and transparent trade-offs",
      "Single source of truth for plans and RAID logs",
      "Outcome focus over activity volume",
    ],
    communicationStyle: [
      "Status updates with decisions needed, risks, and next milestones",
      "Translate technical detail into executive summaries",
      "Document assumptions, dependencies, and owners",
    ],
    boundaries: [
      "Do not commit dates or scope without owner confirmation",
      "Escalate blockers early with options",
      "Separate facts from estimates",
    ],
  },
  "product-manager": {
    personality:
      "You are customer-obsessed and ruthlessly prioritized. You separate discovery hypotheses from committed delivery.",
    coreValues: [
      "Customer impact and measurable outcomes",
      "Ruthless prioritization with transparent trade-offs",
      "Collaboration with design and engineering",
    ],
    communicationStyle: [
      "Problem → insight → option → recommendation",
      "User stories with acceptance criteria when specifying work",
      "Separate discovery hypotheses from committed delivery",
    ],
    boundaries: [
      "Do not invent user research data or metrics",
      "Flag technical feasibility questions for engineering partners",
      "Ask when success metrics or constraints are missing",
    ],
  },
};

/** Derives a human role sentence and expertise list from the persona selection. */
function deriveRoleAndExpertise(selection: PersonaSelection): {
  role: string;
  expertise: string[];
} {
  const { personaId, yearsExperience, fields } = selection;
  const years = yearsExperience.trim() ? ` with ${yearsExperience.trim()} of experience` : "";

  switch (personaId) {
    case "software-engineer": {
      const specialty = String(fields.specialty ?? "Full-stack");
      const languages = listValue(fields.languages);
      const systems = listValue(fields.operatingSystems);
      return {
        role: `${specialty} software engineer${years}. Deliver high-quality software with pragmatic engineering judgment.`,
        expertise: [
          ...languages,
          ...systems.map((os) => `${os} development environment`),
        ],
      };
    }
    case "marketing": {
      const focus = listValue(fields.focus);
      const industry = String(fields.industry ?? "General");
      return {
        role: `Marketing specialist${years} focused on ${joinList(focus)} in ${industry} contexts.`,
        expertise: focus,
      };
    }
    case "finance": {
      const area = String(fields.area ?? "Finance");
      const tools = listValue(fields.tools);
      return {
        role: `${area} professional${years}, proficient with ${joinList(tools)}.`,
        expertise: tools,
      };
    }
    case "hr": {
      const focus = listValue(fields.focus);
      const companySize = String(fields.companySize ?? "General");
      return {
        role: `HR / People operations professional${years} in ${joinList(focus)} at a ${companySize} organization.`,
        expertise: focus,
      };
    }
    case "program-manager": {
      const methodology = listValue(fields.methodology);
      const domain = String(fields.domain ?? "General");
      return {
        role: `Program manager${years} delivering ${domain} initiatives using ${joinList(methodology)}.`,
        expertise: methodology,
      };
    }
    case "product-manager": {
      const productType = String(fields.productType ?? "Product");
      const stage = listValue(fields.stage);
      return {
        role: `Product manager${years} building ${productType} products across ${joinList(stage)} stages.`,
        expertise: stage,
      };
    }
    default:
      throw new Error(`Unsupported persona: ${personaId}`);
  }
}

/**
 * Builds editable soul/identity defaults from a persona selection. The wizard
 * merges these into its form state; users can override every field.
 */
export function deriveSeedFromPersona(selection: PersonaSelection): PersonaSeed {
  // Touch the definition so an invalid persona id fails loudly and early.
  getPersonaDefinition(selection.personaId);

  let seed: PersonaSeed;
  const spec = getExtendedPersonaSpec(selection.personaId);
  if (spec) {
    // Data-driven extended personas seed directly from their shared spec.
    seed = {
      personality: spec.personality,
      coreValues: [...spec.values],
      communicationStyle: [...spec.communicationStyle],
      boundaries: [...spec.boundaries],
      role: interpolateRole(spec, selection),
      expertise: specExpertise(spec, selection),
    };
  } else {
    const defaults = SOUL_DEFAULTS[selection.personaId as BuiltinPersonaId];
    const { role, expertise } = deriveRoleAndExpertise(selection);
    seed = {
      ...defaults,
      coreValues: [...defaults.coreValues],
      communicationStyle: [...defaults.communicationStyle],
      boundaries: [...defaults.boundaries],
      role,
      expertise,
    };
  }

  // Fold in the free-text personalization when present.
  const p = selection.personalization;
  if (p) {
    if (p.focus.trim()) seed.expertise = [...seed.expertise, p.focus.trim()];
    if (p.workingStyle.trim()) {
      seed.communicationStyle = [...seed.communicationStyle, p.workingStyle.trim()];
    }
    if (p.context.trim()) {
      seed.personality = `${seed.personality}\n\nContext: ${p.context.trim()}`;
    }
  }

  return seed;
}
