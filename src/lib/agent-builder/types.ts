import type { PersonaSelection } from "../persona/types";

/** How much intermediate reasoning the agent is allowed. */
export type ThinkingLevel = "none" | "low" | "medium" | "high";

export const THINKING_LEVELS: readonly ThinkingLevel[] = ["none", "low", "medium", "high"];

/** How BotNexus isolates the agent's tool execution. */
export type IsolationStrategy = "in-process" | "subprocess";

export const ISOLATION_STRATEGIES: readonly IsolationStrategy[] = ["in-process", "subprocess"];

/** A runtime tool an agent can be granted (drives `toolIds` + TOOLS.md). */
export interface AgentToolCatalogEntry {
  id: string;
  label: string;
  description: string;
  guidance: readonly string[];
  recommended?: boolean;
}

/** A peer agent this agent coordinates with (rendered into AGENTS.md). */
export interface PeerAgentRef {
  name: string;
  role: string;
}

/**
 * Every input the Agent Builder collects. Persona-seeded fields (soul/identity)
 * are pre-filled from {@link persona} but remain fully editable.
 */
export interface AgentBuilderInput {
  // Identity & BotNexus config
  displayName: string;
  /** Stable slug; the key under `config.json` → `agents` and the directory name. */
  id: string;
  description: string;
  provider: string;
  model: string;
  contextWindow: number;
  thinking: ThinkingLevel;
  enabled: boolean;
  isolationStrategy: IsolationStrategy;

  // Persona seed → SOUL.md + IDENTITY.md
  persona: PersonaSelection | null;
  personality: string;
  coreValues: string[];
  communicationStyle: string[];
  boundaries: string[];
  role: string;
  expertise: string[];
  name: string;
  howToAddress: string;

  // Tools → toolIds + TOOLS.md
  toolIds: string[];
  generalToolPrinciples: string[];
  toolNotes: Record<string, string[]>;

  // Coordination → AGENTS.md
  peers: PeerAgentRef[];
  coordinationPatterns: string[];
  memoryNotes: string[];

  // Optional files
  userPreferences: string;
}

/** The BotNexus agent definition object (value under `config.json` → agents → <id>). */
export interface BotNexusAgentDefinition {
  provider: string;
  model: string;
  displayName: string;
  enabled: boolean;
  description: string;
  isolationStrategy: IsolationStrategy;
  thinking: ThinkingLevel;
  contextWindow: number;
  toolIds: string[];
  memory: {
    enabled: boolean;
    indexing: string;
    promptInjection: string;
  };
  soul: {
    enabled: boolean;
    timezone: string;
    dayBoundary: string;
    reflectionOnSeal: boolean;
  };
  extensions: {
    "botnexus-skills": {
      enabled: boolean;
      maxLoadedSkills: number;
      allowSkillCreation: boolean;
      allowSkillDeletion: boolean;
    };
  };
}

/** The markdown files that make up an agent, in write order. */
export type AgentFileKind = "soul" | "identity" | "agents" | "tools" | "user";

export const AGENT_FILE_KINDS: readonly AgentFileKind[] = [
  "soul",
  "identity",
  "agents",
  "tools",
  "user",
];

export interface AgentBundleFile {
  kind: AgentFileKind;
  filename: string;
  content: string;
}

/** A generated agent: its id, BotNexus definition, and markdown files. */
export interface AgentBundle {
  id: string;
  definition: BotNexusAgentDefinition;
  files: AgentBundleFile[];
}

/** Shape of the master agents file (`config.json` fragment). */
export interface AgentMasterFile {
  agents: Record<string, BotNexusAgentDefinition>;
}

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return typeof value === "string" && THINKING_LEVELS.includes(value as ThinkingLevel);
}
