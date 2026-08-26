/** LLM providers configurable on a BotNexus agent, with suggested models. */
export interface ProviderOption {
  id: string;
  label: string;
  models: string[];
}

export const PROVIDERS: readonly ProviderOption[] = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    models: [
      "claude-opus-5",
      "claude-sonnet-5",
      "claude-opus-4-8",
      "claude-sonnet-4-5-20250929",
      "claude-haiku-4-5",
    ],
  },
  {
    id: "copilot",
    label: "GitHub Copilot",
    models: ["gpt-4.1", "gpt-4o", "o4-mini"],
  },
  {
    id: "openai",
    label: "OpenAI",
    models: ["gpt-4.1", "gpt-4o", "o4-mini"],
  },
  {
    id: "google",
    label: "Google (Gemini)",
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
  },
];

const byId = new Map<string, ProviderOption>(PROVIDERS.map((p) => [p.id, p]));

export function defaultModelForProvider(providerId: string): string {
  return byId.get(providerId)?.models[0] ?? "";
}

export function modelsForProvider(providerId: string): string[] {
  return byId.get(providerId)?.models ?? [];
}
