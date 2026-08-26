import { getAgentToolEntry } from "./tools-catalog";
import type {
  AgentBuilderInput,
  AgentBundle,
  AgentBundleFile,
  AgentFileKind,
  BotNexusAgentDefinition,
} from "./types";

/** Converts a display name into a stable, filesystem-safe agent id. */
export function slugifyAgentId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** A blank builder input with BotNexus-appropriate defaults. */
export function createEmptyAgentInput(overrides: Partial<AgentBuilderInput> = {}): AgentBuilderInput {
  return {
    displayName: "",
    id: "",
    description: "",
    provider: "anthropic",
    model: "claude-opus-5",
    contextWindow: 200000,
    thinking: "medium",
    enabled: true,
    isolationStrategy: "in-process",
    persona: null,
    personality: "",
    coreValues: [],
    communicationStyle: [],
    boundaries: [],
    role: "",
    expertise: [],
    name: "",
    howToAddress: "",
    toolIds: [],
    generalToolPrinciples: [
      "Use `read` and `grep` before making assumptions about file content",
      "Verify results before acting on them",
    ],
    toolNotes: {},
    peers: [],
    coordinationPatterns: [
      "Spawn sub-agents for verification tasks",
      "Delegate specialized analysis to subject-matter agents",
    ],
    memoryNotes: [
      "Store reusable methods as skills",
      "Track important context in conversation memory",
    ],
    world: "",
    userPreferences: "",
    ...overrides,
  };
}

function bulletList(items: string[], fallback: string): string {
  const clean = items.map((item) => item.trim()).filter(Boolean);
  if (clean.length === 0) return `- ${fallback}`;
  return clean.map((item) => `- ${item}`).join("\n");
}

function nameOf(input: AgentBuilderInput): string {
  return input.name.trim() || input.displayName.trim() || "Assistant";
}

function renderSoul(input: AgentBuilderInput): string {
  return `# Soul

## Personality
${input.personality.trim() || "<!-- Core personality and temperament -->"}

## Core Values
${bulletList(input.coreValues, "<!-- What this agent prioritizes -->")}

## Communication Style
${bulletList(input.communicationStyle, "<!-- How the agent should communicate -->")}

## Boundaries
${bulletList(input.boundaries, "<!-- What the agent must not do -->")}
`;
}

function renderIdentity(input: AgentBuilderInput): string {
  const name = nameOf(input);
  const address = input.howToAddress.trim() || `"${name}" works fine. Formal titles aren't necessary.`;
  return `# Identity

## Name
${name}

## Role
${input.role.trim() || "<!-- Primary role and responsibilities -->"}

## Expertise
${bulletList(input.expertise, "<!-- Domains of expertise -->")}

## How to address me
${address}
`;
}

function renderAgents(input: AgentBuilderInput): string {
  const displayName = input.displayName.trim() || nameOf(input);
  const peers = input.peers.filter((peer) => peer.name.trim());
  const peerBlock =
    peers.length > 0
      ? peers.map((peer) => `- **${peer.name.trim()}** — ${peer.role.trim() || "peer agent"}`).join("\n")
      : "- <!-- Peer agents this one coordinates with -->";

  return `# Agents

## This Gateway
${displayName} coordinates with:
${peerBlock}

## Coordination Patterns
${bulletList(input.coordinationPatterns, "<!-- How this agent delegates and consults -->")}

## Memory Notes
${bulletList(input.memoryNotes, "<!-- What to store, where, and for how long -->")}
`;
}

function renderTools(input: AgentBuilderInput): string {
  const sections: string[] = [];
  for (const id of input.toolIds) {
    const entry = getAgentToolEntry(id);
    const label = entry?.label ?? id;
    const notes = input.toolNotes[id]?.length ? input.toolNotes[id] : [...(entry?.guidance ?? [])];
    sections.push(`### ${label}\n${bulletList(notes, "Use responsibly and verify output")}`);
  }

  const toolBlock =
    sections.length > 0
      ? sections.join("\n\n")
      : "### (no tools selected)\n- <!-- Add tools to document their usage -->";

  return `# Tools

## General Principles
${bulletList(input.generalToolPrinciples, "Verify results before acting on them")}

## Tool-Specific Notes

${toolBlock}
`;
}

function renderWorld(input: AgentBuilderInput): string {
  return `# World

${input.world.trim()}
`;
}

function renderUser(input: AgentBuilderInput): string {
  return `# User

${input.userPreferences.trim()}
`;
}

/** Builds the BotNexus agent definition object (value under `agents` → id). */
export function buildAgentDefinition(input: AgentBuilderInput): BotNexusAgentDefinition {
  return {
    provider: input.provider.trim(),
    model: input.model.trim(),
    displayName: input.displayName.trim(),
    enabled: input.enabled,
    description: input.description.trim(),
    isolationStrategy: input.isolationStrategy,
    thinking: input.thinking,
    contextWindow: input.contextWindow,
    toolIds: [...input.toolIds],
    memory: { enabled: true, indexing: "auto", promptInjection: "full" },
    soul: { enabled: true, timezone: "UTC", dayBoundary: "00:00", reflectionOnSeal: false },
    extensions: {
      "botnexus-skills": {
        enabled: true,
        maxLoadedSkills: 20,
        allowSkillCreation: false,
        allowSkillDeletion: false,
      },
    },
  };
}

export interface BuildAgentBundleOptions {
  /** Content overrides per file kind, used verbatim. */
  contentOverrides?: Partial<Record<AgentFileKind, string>>;
}

/** Validates required fields, throwing a user-facing error on the first gap. */
export function validateAgentInput(input: AgentBuilderInput): void {
  if (!input.displayName.trim()) throw new Error("Enter a display name.");
  if (!slugifyAgentId(input.id || input.displayName)) {
    throw new Error("Enter a valid agent id (letters or numbers).");
  }
  if (!input.description.trim()) throw new Error("Enter a short description.");
  if (!input.provider.trim()) throw new Error("Enter a provider.");
  if (!input.model.trim()) throw new Error("Enter a model.");
  if (input.toolIds.length === 0) throw new Error("Select at least one tool.");
  if (!Number.isFinite(input.contextWindow) || input.contextWindow <= 0) {
    throw new Error("Enter a valid context window.");
  }
}

/** Builds the full agent bundle: id, BotNexus definition, and markdown files. */
export function buildAgentBundle(
  input: AgentBuilderInput,
  options: BuildAgentBundleOptions = {},
): AgentBundle {
  validateAgentInput(input);

  const id = (input.id.trim() || slugifyAgentId(input.displayName)).trim();
  const overrides = options.contentOverrides ?? {};
  const files: AgentBundleFile[] = [
    { kind: "soul", filename: "SOUL.md", content: overrides.soul ?? renderSoul(input) },
    { kind: "identity", filename: "IDENTITY.md", content: overrides.identity ?? renderIdentity(input) },
    { kind: "agents", filename: "AGENTS.md", content: overrides.agents ?? renderAgents(input) },
    { kind: "tools", filename: "TOOLS.md", content: overrides.tools ?? renderTools(input) },
  ];

  if (input.world.trim() || overrides.world) {
    files.push({ kind: "world", filename: "WORLD.md", content: overrides.world ?? renderWorld(input) });
  }
  if (input.userPreferences.trim() || overrides.user) {
    files.push({ kind: "user", filename: "USER.md", content: overrides.user ?? renderUser(input) });
  }

  return { id, definition: buildAgentDefinition(input), files };
}

/** Renders a single file kind (used for live preview). */
export function renderAgentFile(kind: AgentFileKind, input: AgentBuilderInput): string {
  switch (kind) {
    case "soul":
      return renderSoul(input);
    case "identity":
      return renderIdentity(input);
    case "agents":
      return renderAgents(input);
    case "tools":
      return renderTools(input);
    case "world":
      return renderWorld(input);
    case "user":
      return renderUser(input);
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unknown file kind: ${String(_exhaustive)}`);
    }
  }
}
