import { zipSync, strToU8 } from "fflate";
import type { AgentBundle } from "./agent-builder/index";
import { serializeAgentSnippet } from "./agent-builder/index";

/** Copies text to the clipboard, resolving to true on success. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function installReadme(id: string): string {
  return `# Installing ${id}

This bundle produces a BotNexus agent.

## 1. Place the agent files
Copy the \`agents/${id}/\` folder to the gateway:

    ~/.botnexus/agents/${id}/

It contains SOUL.md, IDENTITY.md, AGENTS.md, TOOLS.md (and optionally USER.md).
The gateway loads these by convention, in the order AGENTS, SOUL, TOOLS,
BOOTSTRAP, IDENTITY, USER. \`workspace/\`, \`data/\` and \`memory\` are created
automatically at first run.

Environment-wide context does NOT go here: the gateway reads one world file at
\`~/.botnexus/WORLD.md\`, shared by every agent. A WORLD.md inside an agent's
folder is not loaded.

## 2. Register the agent
Merge \`config.snippet.json\` into \`~/.botnexus/config.json\` — add the object
under the top-level \`agents\` key, keyed by \`${id}\`. Keep your other agents.

## 3. Restart the gateway
Restart so the new agent is picked up. Verify it appears in \`GET /api/agents\`
or the portal.
`;
}

/** Builds a .zip (as bytes) containing the agent files, config snippet, and README. */
export function zipAgentBundle(bundle: AgentBundle): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const file of bundle.files) {
    files[`agents/${bundle.id}/${file.filename}`] = strToU8(file.content);
  }
  files["config.snippet.json"] = strToU8(serializeAgentSnippet(bundle.id, bundle.definition));
  files["INSTALL.md"] = strToU8(installReadme(bundle.id));
  return zipSync(files, { level: 6 });
}

/** Triggers a browser download of the agent bundle as `<id>.zip`. */
export function downloadAgentBundle(bundle: AgentBundle): void {
  const bytes = zipAgentBundle(bundle);
  const blob = new Blob([bytes as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${bundle.id}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
