import type { AgentMasterFile, BotNexusAgentDefinition } from "./types";

/** Master file with no agents. */
export function createEmptyMaster(): AgentMasterFile {
  return { agents: {} };
}

/**
 * Parses a master agents fragment. Accepts either a full `config.json`
 * (uses its `agents` object) or a bare `{ "<id>": {...} }` map. Returns an empty
 * master on invalid input.
 */
export function parseMasterFile(raw: string | null | undefined): AgentMasterFile {
  if (!raw || !raw.trim()) return createEmptyMaster();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("That is not valid JSON. Paste a config.json or an agents object.");
  }

  if (!parsed || typeof parsed !== "object") return createEmptyMaster();

  const container = parsed as Record<string, unknown>;
  const agentsNode =
    container.agents && typeof container.agents === "object"
      ? (container.agents as Record<string, unknown>)
      : container;

  const agents: Record<string, BotNexusAgentDefinition> = {};
  for (const [id, value] of Object.entries(agentsNode)) {
    if (value && typeof value === "object") {
      agents[id] = value as BotNexusAgentDefinition;
    }
  }
  return { agents };
}

/** True when an agent with this id already exists in the master. */
export function agentExistsInMaster(master: AgentMasterFile, id: string): boolean {
  return Object.prototype.hasOwnProperty.call(master.agents, id);
}

/** Inserts or replaces an agent by id. */
export function upsertAgent(
  master: AgentMasterFile,
  id: string,
  definition: BotNexusAgentDefinition,
): AgentMasterFile {
  return { agents: { ...master.agents, [id]: definition } };
}

/** Removes an agent by id (no-op if absent). */
export function removeAgent(master: AgentMasterFile, id: string): AgentMasterFile {
  const agents = { ...master.agents };
  delete agents[id];
  return { agents };
}

/** Serializes a full `{ "agents": { ... } }` fragment for config.json. */
export function serializeMasterFile(master: AgentMasterFile): string {
  return `${JSON.stringify(master, null, 2)}\n`;
}

/** Serializes a single-agent fragment ready to paste under config.json → agents. */
export function serializeAgentSnippet(id: string, definition: BotNexusAgentDefinition): string {
  return `${JSON.stringify({ agents: { [id]: definition } }, null, 2)}\n`;
}
