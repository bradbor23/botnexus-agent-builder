import {
  buildAgentBundle,
  createEmptyAgentInput,
  defaultAgentToolSelection,
  isThinkingLevel,
  type AgentBuilderInput,
  type IsolationStrategy,
} from "./agent-builder/index";

/** The LAN gateway used as a fallback when the app runs standalone (dev server). */
export const DEFAULT_GATEWAY_BASE_URL = "http://192.168.168.10:5005";

/** Ports the standalone dev/preview server runs on — never a real gateway origin. */
const DEV_ORIGIN_PORTS = /:(5183|5173|4173|3000)$/;

/**
 * The gateway URL to default to. When the SPA is served *by* the gateway (as the
 * embedded extension), the gateway is same-origin — using it avoids CORS entirely.
 * When running standalone (the Vite dev/preview server), fall back to the LAN gateway.
 */
export function defaultGatewayBaseUrl(): string {
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    if (/^https?:\/\//i.test(origin) && !DEV_ORIGIN_PORTS.test(origin)) {
      return origin;
    }
  }
  return DEFAULT_GATEWAY_BASE_URL;
}

/** A row from `GET /api/agents` — the slim list model. */
export interface GatewayAgentSummary {
  agentId: string;
  displayName: string | null;
  emoji: string | null;
  description: string | null;
  isBuiltIn: boolean;
  apiProvider: string | null;
  modelId: string | null;
}

/** The full agent model from `GET /api/agents/{id}` (only the fields we use). */
export interface GatewayAgentDetail {
  agentId: string;
  displayName: string | null;
  description: string | null;
  apiProvider: string | null;
  modelId: string | null;
  toolIds: string[] | null;
  isolationStrategy: string | null;
  thinking: string | null;
  contextWindow: number | null;
}

/** Raised when a gateway request fails; carries a user-facing hint. */
export class GatewayError extends Error {
  constructor(
    message: string,
    readonly kind: "network" | "http",
    readonly status?: number,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) throw new GatewayError("Enter the gateway URL.", "network");
  if (!/^https?:\/\//i.test(trimmed)) return `http://${trimmed}`;
  return trimmed;
}

async function gatewayGet<T>(baseUrl: string, path: string, apiKey?: string): Promise<T> {
  const url = `${normalizeBaseUrl(baseUrl)}${path}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey?.trim()) headers["X-Api-Key"] = apiKey.trim();

  let response: Response;
  try {
    response = await fetch(url, { headers, mode: "cors" });
  } catch {
    // fetch rejects with a TypeError on network failure *and* on CORS blocks —
    // the two are indistinguishable to JS, so the hint covers both.
    throw new GatewayError(
      `Couldn't reach the gateway at ${normalizeBaseUrl(baseUrl)}. If the gateway is up, ` +
        `the browser likely blocked the request by CORS: add "${window.location.origin}" to ` +
        `gateway.cors.allowedOrigins in config.json and restart the gateway.`,
      "network",
    );
  }

  if (!response.ok) {
    const detail =
      response.status === 401 || response.status === 403
        ? " The gateway rejected the request — an API key may be required, and this origin must be in gateway.cors.allowedOrigins."
        : "";
    throw new GatewayError(
      `Gateway returned HTTP ${response.status} for ${path}.${detail}`,
      "http",
      response.status,
    );
  }

  return (await response.json()) as T;
}

/** Lists the agents currently registered on the gateway. */
export function listGatewayAgents(
  baseUrl: string,
  apiKey?: string,
): Promise<GatewayAgentSummary[]> {
  return gatewayGet<GatewayAgentSummary[]>(baseUrl, "/api/agents", apiKey);
}

/** Fetches one agent's full definition from the gateway. */
export function getGatewayAgent(
  baseUrl: string,
  agentId: string,
  apiKey?: string,
): Promise<GatewayAgentDetail> {
  return gatewayGet<GatewayAgentDetail>(
    baseUrl,
    `/api/agents/${encodeURIComponent(agentId)}`,
    apiKey,
  );
}

function toIsolationStrategy(value: string | null): IsolationStrategy {
  return value === "subprocess" ? "subprocess" : "in-process";
}

/** The REST `AgentDescriptor` (camelCase) that `POST /api/agents` deserializes. */
function buildAgentDescriptor(input: AgentBuilderInput, id: string): Record<string, unknown> {
  return {
    agentId: id,
    displayName: input.displayName.trim(),
    description: input.description.trim(),
    modelId: input.model.trim(),
    apiProvider: input.provider.trim(),
    kind: "Named",
    isolationStrategy: input.isolationStrategy,
    thinking: input.thinking,
    contextWindow: input.contextWindow,
    toolIds: [...input.toolIds],
    memory: { enabled: true, indexing: "auto", promptInjection: "full" },
    soul: { enabled: true, timezone: "UTC", dayBoundary: "00:00", reflectionOnSeal: false },
    extensionConfig: {
      "botnexus-skills": {
        enabled: true,
        maxLoadedSkills: 20,
        allowSkillCreation: false,
        allowSkillDeletion: false,
      },
    },
  };
}

async function gatewayPost(
  baseUrl: string,
  path: string,
  bodyObject: unknown,
  apiKey?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (apiKey?.trim()) headers["X-Api-Key"] = apiKey.trim();
  try {
    return await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
      method: "POST",
      mode: "cors",
      headers,
      body: JSON.stringify(bodyObject),
    });
  } catch {
    throw new GatewayError(
      `Couldn't reach the gateway at ${normalizeBaseUrl(baseUrl)}. If it's up, this origin may be ` +
        `blocked by CORS — serve the app from the gateway, or add "${window.location.origin}" to ` +
        `gateway.cors.allowedOrigins in config.json.`,
      "network",
    );
  }
}

/**
 * Deploys the agent to a running gateway: registers it via the gateway's atomic
 * `POST /api/agents` (config.json + live registry, no restart), then writes its
 * SOUL/IDENTITY/AGENTS/TOOLS[/USER] markdown into `~/.botnexus/agents/<id>/workspace/`
 * via the Agent Builder extension's file endpoint. On a file-write failure the
 * registration is rolled back so a half-deployed agent is never left behind.
 * Throws {@link GatewayError} (409 = the id already exists) on any failure.
 */
export async function deployAgentToGateway(
  baseUrl: string,
  input: AgentBuilderInput,
  apiKey?: string,
): Promise<{ id: string }> {
  const bundle = buildAgentBundle(input); // validates required fields; throws on gaps
  const id = bundle.id;

  // 1) Register (authoritative collision check + validation live in the gateway).
  const register = await gatewayPost(baseUrl, "/api/agents", buildAgentDescriptor(input, id), apiKey);
  if (register.status === 409) {
    throw new GatewayError(
      `An agent "${id}" already exists on the gateway. Choose a different id, or remove the existing agent first.`,
      "http",
      409,
    );
  }
  if (!register.ok) {
    const detail = (await register.text().catch(() => "")).trim();
    throw new GatewayError(
      `The gateway rejected the agent (HTTP ${register.status})${detail ? ` — ${detail}` : ""}.`,
      "http",
      register.status,
    );
  }

  // 2) Write the definition markdown into ~/.botnexus/agents/<id>/workspace/, which is
  //    where the loader reads prompt files from.
  const filesBody: Record<string, string> = {};
  for (const file of bundle.files) filesBody[file.kind] = file.content;

  const write = await gatewayPost(
    baseUrl,
    `/agent-builder/api/agents/${encodeURIComponent(id)}/files`,
    filesBody,
    apiKey,
  );
  if (!write.ok) {
    // Roll back the registration so we don't leave a soulless, half-deployed agent.
    try {
      await fetch(`${normalizeBaseUrl(baseUrl)}/api/agents/${encodeURIComponent(id)}`, {
        method: "DELETE",
        mode: "cors",
        headers: apiKey?.trim() ? { "X-Api-Key": apiKey.trim() } : undefined,
      });
    } catch {
      // best-effort rollback
    }
    const detail = (await write.text().catch(() => "")).trim();
    throw new GatewayError(
      `Registered the agent but failed to write its files (rolled back) — HTTP ${write.status}${detail ? ` — ${detail}` : ""}.`,
      "http",
      write.status,
    );
  }

  return { id };
}

/**
 * Maps a gateway agent's full definition into a fresh {@link AgentBuilderInput}
 * for cloning. The gateway API exposes the config (provider/model/tools/etc.) but
 * not the SOUL/IDENTITY prose, so the soul fields are left for a persona seed or
 * manual editing; the description seeds the role as a starting point.
 */
export function gatewayDetailToInput(detail: GatewayAgentDetail): AgentBuilderInput {
  const displayName = (detail.displayName ?? detail.agentId).trim();
  const description = detail.description?.trim() ?? "";
  return createEmptyAgentInput({
    displayName,
    id: detail.agentId,
    description,
    provider: detail.apiProvider?.trim() || "anthropic",
    model: detail.modelId?.trim() || "",
    contextWindow: detail.contextWindow && detail.contextWindow > 0 ? detail.contextWindow : 200000,
    thinking: isThinkingLevel(detail.thinking) ? detail.thinking : "medium",
    isolationStrategy: toIsolationStrategy(detail.isolationStrategy),
    toolIds: detail.toolIds?.length ? [...detail.toolIds] : defaultAgentToolSelection(),
    role: description,
  });
}
