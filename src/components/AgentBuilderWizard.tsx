import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AGENT_TOOL_CATALOG,
  buildAgentBundle,
  buildAgentDefinition,
  createEmptyAgentInput,
  defaultAgentToolSelection,
  deriveSeedFromPersona,
  ISOLATION_STRATEGIES,
  renderAgentFile,
  serializeAgentSnippet,
  slugifyAgentId,
  THINKING_LEVELS,
  type AgentBuilderInput,
  type AgentBundle,
  type AgentFileKind,
  type IsolationStrategy,
  type PeerAgentRef,
  type ThinkingLevel,
} from "../lib/agent-builder/index";
import {
  EXPERIENCE_YEARS_OPTIONS,
  getPersonaDefinition,
  PERSONA_DEFINITIONS,
  type PersonaFieldDefinition,
  type PersonaId,
  type PersonaSelection,
} from "../lib/persona/index";
import {
  defaultModelForProvider,
  modelsForProvider,
  PROVIDERS,
} from "../lib/providers";
import { copyToClipboard, downloadAgentBundle } from "../lib/download";
import type { GatewayAgentSummary } from "../lib/gateway";
import { WizardHelp } from "./WizardHelp";
import { GatewayPanel } from "./GatewayPanel";

const PREVIEW_LABELS: Record<AgentFileKind, string> = {
  soul: "SOUL.md",
  identity: "IDENTITY.md",
  agents: "AGENTS.md",
  tools: "TOOLS.md",
  world: "WORLD.md",
  user: "USER.md",
};

function linesToList(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function listToText(list: string[]): string {
  return list.join("\n");
}

function parsePeers(value: string): PeerAgentRef[] {
  return linesToList(value).map((line) => {
    const match = line.match(/^(.*?)\s*(?:—|-|:)\s*(.*)$/);
    if (match) {
      return { name: match[1].trim(), role: match[2].trim() };
    }
    return { name: line, role: "" };
  });
}

function peersToText(peers: PeerAgentRef[]): string {
  return peers.map((peer) => (peer.role ? `${peer.name} — ${peer.role}` : peer.name)).join("\n");
}

/**
 * Standalone BotNexus Agent Builder. Seeds an agent's soul/identity from a
 * persona, collects its model/tools/coordination, then generates the agent's
 * Markdown files plus a `config.json` snippet — copyable or downloadable as a
 * ready-to-install `.zip`. Nothing is written to a server; the operator installs
 * the bundle onto the gateway themselves.
 */
export function AgentBuilderWizard() {
  const [input, setInput] = useState<AgentBuilderInput>(() =>
    createEmptyAgentInput({
      provider: "anthropic",
      model: defaultModelForProvider("anthropic"),
      toolIds: defaultAgentToolSelection(),
    }),
  );
  const [idEdited, setIdEdited] = useState(false);

  // Persona seed sub-form state.
  const [personaId, setPersonaId] = useState<PersonaId | "">("");
  const [personaYears, setPersonaYears] = useState<string>(EXPERIENCE_YEARS_OPTIONS[2]);
  const [personaFields, setPersonaFields] = useState<Record<string, string | string[]>>({});

  const [previewKind, setPreviewKind] = useState<AgentFileKind>("soul");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Ids already on the gateway (from the Connect panel), for collision warnings.
  const [existingAgentIds, setExistingAgentIds] = useState<Set<string>>(() => new Set());

  const resolvedId = useMemo(
    () => (input.id.trim() || slugifyAgentId(input.displayName)).trim(),
    [input.id, input.displayName],
  );

  const idCollision = resolvedId.length > 0 && existingAgentIds.has(resolvedId);

  const handleAgentsLoaded = useCallback((agents: GatewayAgentSummary[]) => {
    setExistingAgentIds(new Set(agents.map((agent) => agent.agentId)));
  }, []);

  const handleCloneFromGateway = useCallback((cloned: AgentBuilderInput) => {
    setInput(cloned);
    setIdEdited(true);
    setPersonaId("");
    setPersonaFields({});
    setPreviewKind("soul");
    setErrorMessage(null);
    setStatusMessage(
      `Cloned "${cloned.id}" — config, model, and tools are prefilled. Apply a persona or edit the soul fields, then re-generate.`,
    );
  }, []);

  const previewKinds = useMemo<AgentFileKind[]>(() => {
    const kinds: AgentFileKind[] = ["soul", "identity", "agents", "tools"];
    if (input.world.trim()) kinds.push("world");
    if (input.userPreferences.trim()) kinds.push("user");
    return kinds;
  }, [input.world, input.userPreferences]);

  useEffect(() => {
    if (!previewKinds.includes(previewKind)) setPreviewKind(previewKinds[0]);
  }, [previewKind, previewKinds]);

  const patch = useCallback((next: Partial<AgentBuilderInput>) => {
    setInput((current) => ({ ...current, ...next }));
  }, []);

  const personaDefinition = personaId ? getPersonaDefinition(personaId) : null;

  const setPersonaField = useCallback((fieldId: string, value: string | string[]) => {
    setPersonaFields((current) => ({ ...current, [fieldId]: value }));
  }, []);

  const applyPersona = useCallback(() => {
    if (!personaId) return;
    const selection: PersonaSelection = {
      personaId,
      yearsExperience: personaYears,
      fields: personaFields,
    };
    const seed = deriveSeedFromPersona(selection);
    setInput((current) => ({
      ...current,
      persona: selection,
      personality: seed.personality,
      coreValues: seed.coreValues,
      communicationStyle: seed.communicationStyle,
      boundaries: seed.boundaries,
      role: seed.role,
      expertise: seed.expertise,
    }));
    setStatusMessage(`Seeded soul & identity from the ${getPersonaDefinition(personaId).label} persona.`);
  }, [personaFields, personaId, personaYears]);

  const toggleTool = useCallback((toolId: string) => {
    setInput((current) => {
      const has = current.toolIds.includes(toolId);
      const toolIds = has
        ? current.toolIds.filter((id) => id !== toolId)
        : [...current.toolIds, toolId];
      return { ...current, toolIds };
    });
  }, []);

  const previewContent = useMemo(
    () => renderAgentFile(previewKind, input),
    [input, previewKind],
  );

  const configSnippet = useMemo(
    () => serializeAgentSnippet(resolvedId || "<id>", buildAgentDefinition(input)),
    [input, resolvedId],
  );

  const flashCopied = useCallback((key: string) => {
    setCopied(key);
    setErrorMessage(null);
    window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1600);
  }, []);

  const handleCopyFile = useCallback(async () => {
    const ok = await copyToClipboard(previewContent);
    if (ok) flashCopied(`file:${previewKind}`);
    else setErrorMessage("Could not copy to clipboard.");
  }, [flashCopied, previewContent, previewKind]);

  const handleCopySnippet = useCallback(async () => {
    const ok = await copyToClipboard(configSnippet);
    if (ok) flashCopied("snippet");
    else setErrorMessage("Could not copy to clipboard.");
  }, [configSnippet, flashCopied]);

  const handleDownload = useCallback(() => {
    setErrorMessage(null);
    setStatusMessage(null);
    let bundle: AgentBundle;
    try {
      bundle = buildAgentBundle(input);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Please complete the required fields.");
      return;
    }
    downloadAgentBundle(bundle);
    setStatusMessage(`Downloaded ${bundle.id}.zip — extract it into your gateway and merge the config snippet.`);
  }, [input]);

  return (
    <div className="startup">
      <div className="startup__panel startup__panel--wizard startup__panel--wide">
        <header className="startup__header">
          <h1 className="startup__title">BotNexus Agent Builder</h1>
          <p className="startup__subtitle">
            Define a gateway agent once — pick a persona to seed its soul, set its model and tools,
            then generate <code>SOUL.md</code>, <code>IDENTITY.md</code>, <code>AGENTS.md</code>,{" "}
            <code>TOOLS.md</code>, and a <code>config.json</code> snippet ready to install.
          </p>
        </header>

        <WizardHelp
          summary={
            <>
              Each agent is a folder of Markdown files plus one entry under{" "}
              <code>config.json → agents</code>. The persona seeds the personality; you fill in the
              model, tools, and coordination.
            </>
          }
          steps={[
            <>
              <strong>Seed from a persona (optional).</strong> Choose a role and click Apply to
              pre-fill personality, values, communication, and expertise.
            </>,
            <>
              <strong>Set identity &amp; model.</strong> Name, description, provider/model, thinking
              and isolation become the <code>agents</code> entry.
            </>,
            <>
              <strong>Pick tools &amp; coordination.</strong> Selected tools drive both{" "}
              <code>toolIds</code> and <code>TOOLS.md</code>; list peer agents for <code>AGENTS.md</code>.
            </>,
            <>
              <strong>Preview &amp; download.</strong> Check each file, copy the config snippet, then
              download the <code>.zip</code> bundle and install it on the gateway.
            </>,
          ]}
          tip={
            <>
              Install: drop <code>agents/&lt;id&gt;/</code> into <code>~/.botnexus/agents/</code> and
              merge <code>config.snippet.json</code> into your <code>config.json</code>. The bundle's{" "}
              <code>INSTALL.md</code> has the full steps.
            </>
          }
        />

        <div className="wizard">
          {/* 0 · Gateway connector (optional) */}
          <GatewayPanel onAgentsLoaded={handleAgentsLoaded} onClone={handleCloneFromGateway} />

          {/* 1 · Persona seed */}
          <section className="wizard__section">
            <span className="wizard__label">1 · Seed from a persona (optional)</span>
            <div className="profile-form">
              <label className="profile-field">
                <span className="profile-field__label">Persona</span>
                <select
                  className="profile-field__input"
                  value={personaId}
                  onChange={(event) => {
                    setPersonaId(event.target.value as PersonaId | "");
                    setPersonaFields({});
                  }}
                >
                  <option value="">— None —</option>
                  {PERSONA_DEFINITIONS.map((definition) => (
                    <option key={definition.id} value={definition.id}>
                      {definition.label}
                    </option>
                  ))}
                </select>
              </label>

              {personaDefinition && (
                <>
                  <label className="profile-field">
                    <span className="profile-field__label">Years of experience</span>
                    <select
                      className="profile-field__input"
                      value={personaYears}
                      onChange={(event) => setPersonaYears(event.target.value)}
                    >
                      {EXPERIENCE_YEARS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  {personaDefinition.fields.map((field) => (
                    <PersonaFieldControl
                      key={field.id}
                      field={field}
                      value={personaFields[field.id]}
                      onChange={(value) => setPersonaField(field.id, value)}
                    />
                  ))}
                </>
              )}
            </div>
            {personaDefinition && (
              <div className="wizard__row">
                <button type="button" className="cf-btn" onClick={applyPersona}>
                  Apply persona to soul &amp; identity
                </button>
                <span className="wizard__hint">
                  Fills the fields below — you can edit everything afterwards.
                </span>
              </div>
            )}
          </section>

          {/* 2 · Identity & model */}
          <section className="wizard__section">
            <span className="wizard__label">2 · Identity &amp; model</span>
            <div className="profile-form">
              <label className="profile-field">
                <span className="profile-field__label">Display name *</span>
                <input
                  className="profile-field__input"
                  value={input.displayName}
                  onChange={(event) => {
                    const displayName = event.target.value;
                    patch(
                      idEdited
                        ? { displayName }
                        : { displayName, id: slugifyAgentId(displayName) },
                    );
                  }}
                  placeholder="Research Assistant"
                />
              </label>
              <label className="profile-field">
                <span className="profile-field__label">Agent id *</span>
                <input
                  className="profile-field__input"
                  value={input.id}
                  onChange={(event) => {
                    setIdEdited(true);
                    patch({ id: slugifyAgentId(event.target.value) });
                  }}
                  placeholder="research-assistant"
                />
                {idCollision && (
                  <span className="profile-field__warn" role="status">
                    An agent with id <code>{resolvedId}</code> already exists on the gateway —
                    installing this bundle will overwrite it.
                  </span>
                )}
              </label>
              <label className="profile-field profile-field--wide">
                <span className="profile-field__label">Description *</span>
                <input
                  className="profile-field__input"
                  value={input.description}
                  onChange={(event) => patch({ description: event.target.value })}
                  placeholder="Conducts research and synthesizes findings."
                />
              </label>
              <label className="profile-field">
                <span className="profile-field__label">Provider *</span>
                <select
                  className="profile-field__input"
                  value={input.provider}
                  onChange={(event) => {
                    const provider = event.target.value;
                    patch({ provider, model: defaultModelForProvider(provider) });
                  }}
                >
                  {PROVIDERS.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="profile-field">
                <span className="profile-field__label">Model *</span>
                <input
                  className="profile-field__input"
                  list="model-suggestions"
                  value={input.model}
                  onChange={(event) => patch({ model: event.target.value })}
                  placeholder="claude-opus-5"
                />
                <datalist id="model-suggestions">
                  {modelsForProvider(input.provider).map((model) => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
              </label>
              <label className="profile-field">
                <span className="profile-field__label">Context window</span>
                <input
                  className="profile-field__input"
                  type="number"
                  value={input.contextWindow}
                  onChange={(event) => patch({ contextWindow: Number(event.target.value) })}
                />
              </label>
              <label className="profile-field">
                <span className="profile-field__label">Thinking</span>
                <select
                  className="profile-field__input"
                  value={input.thinking}
                  onChange={(event) => patch({ thinking: event.target.value as ThinkingLevel })}
                >
                  {THINKING_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </label>
              <label className="profile-field">
                <span className="profile-field__label">Isolation strategy</span>
                <select
                  className="profile-field__input"
                  value={input.isolationStrategy}
                  onChange={(event) =>
                    patch({ isolationStrategy: event.target.value as IsolationStrategy })
                  }
                >
                  {ISOLATION_STRATEGIES.map((strategy) => (
                    <option key={strategy} value={strategy}>
                      {strategy}
                    </option>
                  ))}
                </select>
              </label>
              <label className="profile-field profile-field--checkbox">
                <input
                  type="checkbox"
                  checked={input.enabled}
                  onChange={(event) => patch({ enabled: event.target.checked })}
                />
                <span className="profile-field__label">Enabled on the gateway</span>
              </label>
            </div>
          </section>

          {/* 3 · Soul & identity content */}
          <section className="wizard__section">
            <span className="wizard__label">3 · Soul &amp; identity</span>
            <div className="profile-form">
              <label className="profile-field profile-field--wide">
                <span className="profile-field__label">Role</span>
                <textarea
                  className="profile-field__input"
                  value={input.role}
                  onChange={(event) => patch({ role: event.target.value })}
                  rows={2}
                />
              </label>
              <label className="profile-field profile-field--wide">
                <span className="profile-field__label">Personality</span>
                <textarea
                  className="profile-field__input"
                  value={input.personality}
                  onChange={(event) => patch({ personality: event.target.value })}
                  rows={2}
                />
              </label>
              <ListField
                label="Expertise (one per line)"
                value={input.expertise}
                onChange={(list) => patch({ expertise: list })}
              />
              <ListField
                label="Core values (one per line)"
                value={input.coreValues}
                onChange={(list) => patch({ coreValues: list })}
              />
              <ListField
                label="Communication style (one per line)"
                value={input.communicationStyle}
                onChange={(list) => patch({ communicationStyle: list })}
              />
              <ListField
                label="Boundaries (one per line)"
                value={input.boundaries}
                onChange={(list) => patch({ boundaries: list })}
              />
              <label className="profile-field">
                <span className="profile-field__label">Name</span>
                <input
                  className="profile-field__input"
                  value={input.name}
                  onChange={(event) => patch({ name: event.target.value })}
                  placeholder={input.displayName || "Assistant"}
                />
              </label>
              <label className="profile-field">
                <span className="profile-field__label">How to address me</span>
                <input
                  className="profile-field__input"
                  value={input.howToAddress}
                  onChange={(event) => patch({ howToAddress: event.target.value })}
                  placeholder={`"${input.name || input.displayName || "Assistant"}" is fine.`}
                />
              </label>
            </div>
          </section>

          {/* 4 · Tools */}
          <section className="wizard__section">
            <span className="wizard__label">4 · Tools</span>
            <p className="wizard__hint">
              Selected tools populate <code>toolIds</code> and the per-tool sections of{" "}
              <code>TOOLS.md</code>.
            </p>
            <div className="tool-grid">
              {AGENT_TOOL_CATALOG.map((tool) => {
                const checked = input.toolIds.includes(tool.id);
                return (
                  <label key={tool.id} className={`tool-chip${checked ? " tool-chip--on" : ""}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTool(tool.id)}
                    />
                    <span className="tool-chip__body">
                      <span className="tool-chip__label">{tool.label}</span>
                      <span className="tool-chip__desc">{tool.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          {/* 5 · Coordination */}
          <section className="wizard__section">
            <span className="wizard__label">5 · Coordination (AGENTS.md)</span>
            <div className="profile-form">
              <PeersField peers={input.peers} onChange={(peers) => patch({ peers })} />
              <ListField
                label="Coordination patterns (one per line)"
                value={input.coordinationPatterns}
                onChange={(list) => patch({ coordinationPatterns: list })}
              />
              <ListField
                label="Memory notes (one per line)"
                value={input.memoryNotes}
                onChange={(list) => patch({ memoryNotes: list })}
              />
            </div>
          </section>

          {/* 6 · Optional files */}
          <section className="wizard__section">
            <span className="wizard__label">6 · Optional context</span>
            <div className="profile-form">
              <label className="profile-field profile-field--wide">
                <span className="profile-field__label">World / environment (WORLD.md)</span>
                <textarea
                  className="profile-field__input"
                  value={input.world}
                  onChange={(event) => patch({ world: event.target.value })}
                  rows={2}
                  placeholder="Context about the environment the agent operates in. Leave blank to skip WORLD.md."
                />
              </label>
              <label className="profile-field profile-field--wide">
                <span className="profile-field__label">User preferences (USER.md)</span>
                <textarea
                  className="profile-field__input"
                  value={input.userPreferences}
                  onChange={(event) => patch({ userPreferences: event.target.value })}
                  rows={2}
                  placeholder="Preferences the agent should respect. Leave blank to skip USER.md."
                />
              </label>
            </div>
          </section>

          {/* 7 · Preview */}
          <section className="wizard__section">
            <span className="wizard__label">7 · Preview files</span>
            <div className="preview">
              <div className="preview__toolbar">
                <select
                  className="preview__select"
                  value={previewKind}
                  onChange={(event) => setPreviewKind(event.target.value as AgentFileKind)}
                  aria-label="Preview file"
                >
                  {previewKinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {PREVIEW_LABELS[kind]}
                    </option>
                  ))}
                </select>
                <div className="preview__actions">
                  <button type="button" className="cf-btn" onClick={() => void handleCopyFile()}>
                    {copied === `file:${previewKind}` ? "Copied ✓" : "Copy this file"}
                  </button>
                </div>
              </div>
              <pre className="preview__body" aria-label="File preview">
                {previewContent}
              </pre>
            </div>
          </section>

          {/* 8 · Config snippet */}
          <section className="wizard__section">
            <span className="wizard__label">8 · config.json snippet</span>
            <p className="wizard__hint">
              Merge this object into <code>~/.botnexus/config.json</code> under the top-level{" "}
              <code>agents</code> key (existing agents are preserved).
            </p>
            <div className="preview">
              <div className="preview__toolbar">
                <code className="preview__filename">config.snippet.json</code>
                <div className="preview__actions">
                  <button type="button" className="cf-btn" onClick={() => void handleCopySnippet()}>
                    {copied === "snippet" ? "Copied ✓" : "Copy snippet"}
                  </button>
                </div>
              </div>
              <pre className="preview__body" aria-label="Config snippet">
                {configSnippet}
              </pre>
            </div>
          </section>
        </div>

        <div className="startup__actions startup__actions--wizard">
          {statusMessage && (
            <p className="wizard__status" role="status">
              {statusMessage}
            </p>
          )}
          {errorMessage && (
            <p className="wizard__error" role="alert">
              {errorMessage}
            </p>
          )}
          {idCollision && (
            <p className="wizard__status wizard__status--warn" role="status">
              Heads up: <code>{resolvedId}</code> already exists on the gateway — this bundle will
              overwrite it when installed.
            </p>
          )}
          <div className="startup__actions-row">
            <button type="button" className="cf-btn cf-btn--primary" onClick={handleDownload}>
              Download bundle (.zip)
            </button>
          </div>
          <p className="wizard__hint">
            The <code>.zip</code> contains <code>agents/{resolvedId || "<id>"}/</code>,{" "}
            <code>config.snippet.json</code>, and <code>INSTALL.md</code>.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * A "one item per line" textarea. Holds the raw typed text locally so newlines
 * (including trailing/blank lines mid-edit) survive, and only reports the parsed
 * list upward. Re-syncs when the parent value changes for another reason (e.g. a
 * persona is applied).
 */
function ListField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (list: string[]) => void;
}) {
  const [text, setText] = useState(() => listToText(value));

  useEffect(() => {
    if (listToText(linesToList(text)) !== listToText(value)) {
      setText(listToText(value));
    }
    // Intentionally only resync on external value changes, not on local typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <label className="profile-field profile-field--wide">
      <span className="profile-field__label">{label}</span>
      <textarea
        className="profile-field__input"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          onChange(linesToList(event.target.value));
        }}
        rows={Math.min(8, Math.max(2, text.split("\n").length + 1))}
      />
    </label>
  );
}

/**
 * Peer-agents textarea ("Name — role" per line). Same raw-text-local pattern as
 * {@link ListField} so pressing Enter reliably starts a new line.
 */
function PeersField({
  peers,
  onChange,
}: {
  peers: PeerAgentRef[];
  onChange: (peers: PeerAgentRef[]) => void;
}) {
  const [text, setText] = useState(() => peersToText(peers));

  useEffect(() => {
    if (peersToText(parsePeers(text)) !== peersToText(peers)) {
      setText(peersToText(peers));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peers]);

  return (
    <label className="profile-field profile-field--wide">
      <span className="profile-field__label">Peer agents (one per line, &quot;Name — role&quot;)</span>
      <textarea
        className="profile-field__input"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          onChange(parsePeers(event.target.value));
        }}
        rows={Math.max(3, text.split("\n").length + 1)}
        placeholder={"Code Reviewer — peer review of technical analysis\nData Analyst — deeper statistical work"}
      />
    </label>
  );
}

function PersonaFieldControl({
  field,
  value,
  onChange,
}: {
  field: PersonaFieldDefinition;
  value: string | string[] | undefined;
  onChange: (value: string | string[]) => void;
}) {
  if (field.type === "multiselect") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="profile-field profile-field--wide">
        <span className="profile-field__label">{field.label}</span>
        <div className="tool-grid tool-grid--compact">
          {field.options.map((option) => {
            const checked = selected.includes(option);
            return (
              <label key={option} className={`tool-chip${checked ? " tool-chip--on" : ""}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onChange(
                      checked ? selected.filter((item) => item !== option) : [...selected, option],
                    )
                  }
                />
                <span className="tool-chip__body">
                  <span className="tool-chip__label">{option}</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <label className="profile-field">
      <span className="profile-field__label">{field.label}</span>
      <select
        className="profile-field__input"
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">— Select —</option>
        {field.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
