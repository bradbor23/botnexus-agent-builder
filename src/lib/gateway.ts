import {
  createEmptyAgentInput,
  defaultAgentToolSelection,
  isThinkingLevel,
  type AgentBuilderInput,
  type IsolationStrategy,
} from "./agent-builder/index";

/** The default gateway the panel points at (override in the UI). */
export const DEFAULT_GATEWAY_BASE_URL = "http://192.168.168.10:5005";

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
