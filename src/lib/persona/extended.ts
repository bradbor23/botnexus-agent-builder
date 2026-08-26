import type {
  PersonaContextFiles,
  PersonaFieldDefinition,
  PersonaId,
  PersonaSelection,
} from "./types";

/**
 * A fully data-driven persona definition. Unlike the original six personas
 * (which have bespoke builder functions), extended personas describe all of
 * their content as data so the registry, the wizard builder, and the Agent
 * Builder seed can share a single source of truth.
 */
export interface ExtendedPersonaSpec {
  id: PersonaId;
  label: string;
  description: string;
  fields: PersonaFieldDefinition[];
  /** Personality prose (SOUL.md `## Personality`). */
  personality: string;
  /** Core values (SOUL.md `## Core Values`). */
  values: string[];
  /** Communication style bullets. */
  communicationStyle: string[];
  /** Professional boundaries / escalation rules. */
  boundaries: string[];
  /** Durable working preferences (memory). */
  preferences: string[];
  /** Title of the storage checklist section. */
  checklistTitle: string;
  /** Checklist items (storage). */
  checklist: string[];
  /** One-sentence role summary with `{fieldId}` tokens to interpolate. */
  roleTemplate: string;
  /** Field ids whose selected values represent this role's expertise. */
  expertiseFields: string[];
}

export function listValue(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

export function joinList(items: string[]): string {
  if (items.length === 0) return "a range of areas";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function bulletList(items: string[], fallback: string): string {
  const clean = items.map((item) => item.trim()).filter(Boolean);
  if (clean.length === 0) return `- ${fallback}`;
  return clean.map((item) => `- ${item}`).join("\n");
}

/** Replaces `{fieldId}` tokens in a role template with selected field values. */
export function interpolateRole(spec: ExtendedPersonaSpec, selection: PersonaSelection): string {
  return spec.roleTemplate.replace(/\{(\w+)\}/g, (_match, fieldId: string) => {
    const values = listValue(selection.fields[fieldId]);
    return values.length > 0 ? joinList(values) : "your area";
  });
}

/** Expertise bullets derived from the spec's expertise fields. */
export function specExpertise(spec: ExtendedPersonaSpec, selection: PersonaSelection): string[] {
  const expertise: string[] = [];
  for (const fieldId of spec.expertiseFields) {
    for (const value of listValue(selection.fields[fieldId])) {
      if (!expertise.includes(value)) expertise.push(value);
    }
  }
  return expertise;
}

/** Renders soul/memory/storage for a data-driven persona spec. */
export function buildPersonaFilesFromSpec(
  selection: PersonaSelection,
  spec: ExtendedPersonaSpec,
): PersonaContextFiles {
  const years = selection.yearsExperience.trim();
  const expertise = specExpertise(spec, selection);

  const fieldLines = spec.fields
    .map((field) => {
      const value = listValue(selection.fields[field.id]);
      return value.length > 0 ? `- ${field.label}: ${joinList(value)}` : null;
    })
    .filter((line): line is string => line !== null);

  const soul = `# Soul

${interpolateRole(spec, selection)}.

## Personality
${spec.personality}

## Expertise
${bulletList(expertise, "Broad expertise across the discipline")}

## Communication style
${bulletList(spec.communicationStyle, "Clear, structured, and audience-aware")}

## Values
${bulletList(spec.values, "Quality and integrity")}

## Boundaries
${bulletList(spec.boundaries, "Escalate when outside your remit")}
`;

  const memory = `# Memory

## About me
- Role: ${spec.label}
- Experience: ${years || "Not specified"}
${fieldLines.join("\n")}

## Preferences
${bulletList(spec.preferences, "Prefer clear, well-documented decisions")}
`;

  const storage = `# Storage

## ${spec.checklistTitle}
${spec.checklist.map((item) => `- [ ] ${item}`).join("\n")}

## Focus areas
${bulletList(expertise, "Core responsibilities of the role")}
`;

  return { soul, memory, storage };
}
