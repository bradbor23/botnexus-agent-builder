import { useCallback, useEffect, useState } from "react";
import {
  defaultGatewayBaseUrl,
  GatewayError,
  gatewayDetailToInput,
  getGatewayAgent,
  listGatewayAgents,
  type GatewayAgentSummary,
} from "../lib/gateway";
import type { AgentBuilderInput } from "../lib/agent-builder/index";

const BASE_URL_STORAGE_KEY = "bn-gateway-base-url";

interface GatewayPanelProps {
  /** Called with the agents currently on the gateway, for id-collision checks. */
  onAgentsLoaded: (agents: GatewayAgentSummary[]) => void;
  /** Called when the user clones an existing agent into the wizard. */
  onClone: (input: AgentBuilderInput) => void;
}

function loadStoredBaseUrl(): string {
  try {
    return localStorage.getItem(BASE_URL_STORAGE_KEY) ?? defaultGatewayBaseUrl();
  } catch {
    return defaultGatewayBaseUrl();
  }
}

/**
 * Read-only gateway connector. Lists the agents on a BotNexus gateway and lets
 * the user clone one into the wizard as a starting point. Nothing is written to
 * the gateway. The base URL is remembered; the optional API key is kept in memory
 * only (never persisted).
 */
export function GatewayPanel({ onAgentsLoaded, onClone }: GatewayPanelProps) {
  const [open, setOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState<string>(loadStoredBaseUrl);
  const [apiKey, setApiKey] = useState("");
  const [agents, setAgents] = useState<GatewayAgentSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(BASE_URL_STORAGE_KEY, baseUrl);
    } catch {
      // Ignore storage failures (private mode, etc.).
    }
  }, [baseUrl]);

  const handleLoad = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const list = await listGatewayAgents(baseUrl, apiKey);
      list.sort((a, b) => a.agentId.localeCompare(b.agentId));
      setAgents(list);
      onAgentsLoaded(list);
      setStatus(`Loaded ${list.length} agent${list.length === 1 ? "" : "s"} from the gateway.`);
    } catch (err) {
      setAgents(null);
      onAgentsLoaded([]);
      setError(err instanceof GatewayError ? err.message : "Could not load agents from the gateway.");
    } finally {
      setLoading(false);
    }
  }, [apiKey, baseUrl, onAgentsLoaded]);

  const handleClone = useCallback(
    async (agentId: string) => {
      setCloningId(agentId);
      setError(null);
      setStatus(null);
      try {
        const detail = await getGatewayAgent(baseUrl, agentId, apiKey);
        onClone(gatewayDetailToInput(detail));
        setStatus(
          `Cloned "${agentId}" into the wizard. Config, model, and tools are prefilled — ` +
            `apply a persona or edit to fill the soul fields, then re-generate.`,
        );
      } catch (err) {
        setError(err instanceof GatewayError ? err.message : `Could not clone "${agentId}".`);
      } finally {
        setCloningId(null);
      }
    },
    [apiKey, baseUrl, onClone],
  );

  return (
    <section className="wizard__section gateway">
      <button
        type="button"
        className="gateway__toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">{open ? "▾" : "▸"}</span> Connect to a gateway (optional) — list &amp;
        clone existing agents
      </button>

      {open && (
        <div className="gateway__body">
          <p className="wizard__hint">
            Read-only. Lists the agents on a running BotNexus gateway and lets you clone one as a
            starting point. Requires the gateway to allow this origin — add{" "}
            <code>{typeof window !== "undefined" ? window.location.origin : ""}</code> to{" "}
            <code>gateway.cors.allowedOrigins</code> in <code>config.json</code> and restart it.
          </p>

          <div className="profile-form">
            <label className="profile-field profile-field--wide">
              <span className="profile-field__label">Gateway URL</span>
              <input
                className="profile-field__input"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder={defaultGatewayBaseUrl()}
                spellCheck={false}
              />
            </label>
            <label className="profile-field profile-field--wide">
              <span className="profile-field__label">API key (optional — kept in memory only)</span>
              <input
                className="profile-field__input"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Only needed if the gateway requires authentication"
                autoComplete="off"
              />
            </label>
          </div>

          <div className="wizard__row">
            <button type="button" className="cf-btn" onClick={() => void handleLoad()} disabled={loading}>
              {loading ? "Loading…" : agents ? "Reload agents" : "Load agents"}
            </button>
            {status && (
              <span className="wizard__status" role="status">
                {status}
              </span>
            )}
          </div>

          {error && (
            <p className="wizard__error" role="alert">
              {error}
            </p>
          )}

          {agents && agents.length > 0 && (
            <ul className="gateway__list">
              {agents.map((agent) => (
                <li key={agent.agentId} className="gateway__item">
                  <div className="gateway__item-main">
                    <span className="gateway__item-name">
                      {agent.emoji ? `${agent.emoji} ` : ""}
                      {agent.displayName || agent.agentId}
                      {agent.isBuiltIn && <span className="gateway__badge">built-in</span>}
                    </span>
                    <code className="gateway__item-id">{agent.agentId}</code>
                    <span className="gateway__item-model">
                      {[agent.apiProvider, agent.modelId].filter(Boolean).join(" · ") || "—"}
                    </span>
                    {agent.description && (
                      <span className="gateway__item-desc">{agent.description}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="cf-btn"
                    onClick={() => void handleClone(agent.agentId)}
                    disabled={cloningId !== null}
                  >
                    {cloningId === agent.agentId ? "Cloning…" : "Clone into wizard"}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {agents && agents.length === 0 && (
            <p className="wizard__hint">No agents registered on the gateway yet.</p>
          )}
        </div>
      )}
    </section>
  );
}
