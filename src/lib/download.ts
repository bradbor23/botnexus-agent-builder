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
Copy the \`agents/${id}/\` folder to the gateway, keeping the \`workspace/\` level:

    ~/.botnexus/agents/${id}/workspace/

The prompt files go in \`workspace/\`, NOT in \`agents/${id}/\` itself. The loader
reads them from there and prefers that directory whenever it exists, so a file
left at the agent root is silently ignored in favour of the scaffolded one, with
nothing logged. \`data/\` and \`memory\` are created automatically at first run.

The bundle contains SOUL.md, IDENTITY.md, AGENTS.md, TOOLS.md (and optionally
USER.md), already under \`workspace/\`. They are loaded in the order AGENTS, SOUL,
TOOLS, BOOTSTRAP, IDENTITY, USER — so unpacking the folder as-is is enough.

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
    // The workspace/ level is required: WorkspaceContextBuilder reads prompt files from
    // <agent>/workspace/ and only falls back to the agent root when that directory is absent,
    // which it never is once the gateway has scaffolded the agent.
    files[`agents/${bundle.id}/workspace/${file.filename}`] = strToU8(file.content);
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
