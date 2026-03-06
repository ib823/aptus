/**
 * AI Orchestrator — "Bring Your Own AI" (BYOAI) Engine
 * Handles multi-provider routing (OpenAI, Azure, Gemini) based on Org config.
 */

import { prisma } from "@/lib/db/prisma";
import { decryptApiKey, isEncryptedKey } from "./ai-key-crypto";

export type AIProvider = "openai" | "azure" | "gemini" | "anthropic";

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  endpoint?: string;
  modelName?: string;
}

export interface AIResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

const AZURE_ENDPOINT_RE =
  /^https:\/\/[a-zA-Z0-9-]+\.openai\.azure\.com\//;

/**
 * Main AI Service Factory
 */
export class AIOrchestrator {
  private organizationId: string;

  constructor(organizationId: string) {
    this.organizationId = organizationId;
  }

  /**
   * Primary interface for text generation (e.g. Gap Resolution Suggester)
   */
  async generateText(prompt: string, systemPrompt?: string): Promise<AIResponse> {
    const config = await this.getEffectiveConfig();

    switch (config.provider) {
      case "openai":
        return this.callOpenAI(config, prompt, systemPrompt);
      case "gemini":
        return this.callGemini(config, prompt, systemPrompt);
      case "azure":
        return this.callAzureOpenAI(config, prompt, systemPrompt);
      case "anthropic":
        throw new Error("Anthropic provider is not yet implemented.");
      default:
        throw new Error(`AI Provider ${config.provider} not supported`);
    }
  }

  /**
   * Retrieves Org config, or falls back to system defaults
   */
  private async getEffectiveConfig(): Promise<AIConfig> {
    const org = await prisma.organization.findUnique({
      where: { id: this.organizationId },
      select: { aiConfig: true }
    });

    if (org?.aiConfig && typeof org.aiConfig === 'object') {
      const raw = org.aiConfig as unknown as AIConfig;
      // Decrypt API key if it was encrypted at rest
      if (raw.apiKey && isEncryptedKey(raw.apiKey)) {
        raw.apiKey = decryptApiKey(raw.apiKey);
      }
      return raw;
    }

    // System Fallback (Environment Variables)
    return {
      provider: (process.env.DEFAULT_AI_PROVIDER as AIProvider) || "openai",
      apiKey: process.env.OPENAI_API_KEY || "",
      modelName: process.env.OPENAI_MODEL || "gpt-4o",
    };
  }

  private async callOpenAI(config: AIConfig, prompt: string, system?: string): Promise<AIResponse> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.modelName || "gpt-4o",
        messages: [
          ...(system ? [{ role: "system", content: system }] : []),
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API returned status ${response.status}`);
    }
    const data = await response.json();

    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("OpenAI response missing expected content structure");
    }

    return {
      content,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      }
    };
  }

  private async callGemini(config: AIConfig, prompt: string, system?: string): Promise<AIResponse> {
    const baseUrl = "https://generativelanguage.googleapis.com/v1beta/models";
    const model = config.modelName || "gemini-1.5-pro";
    // Use header-based auth instead of query string to avoid key leakage in logs
    const url = `${baseUrl}/${model}:generateContent`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": config.apiKey,
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `${system ? system + "\n\n" : ""}${prompt}` }]
        }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API returned status ${response.status}`);
    }
    const data = await response.json();

    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof content !== "string") {
      throw new Error("Gemini response missing expected content structure");
    }

    return {
      content,
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
      }
    };
  }

  private async callAzureOpenAI(config: AIConfig, prompt: string, system?: string): Promise<AIResponse> {
    if (!config.endpoint) throw new Error("Azure OpenAI requires an endpoint URL");

    // Validate Azure endpoint format to prevent SSRF
    if (!AZURE_ENDPOINT_RE.test(config.endpoint)) {
      throw new Error("Azure endpoint must match https://{name}.openai.azure.com/...");
    }

    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": config.apiKey,
      },
      body: JSON.stringify({
        messages: [
          ...(system ? [{ role: "system", content: system }] : []),
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Azure OpenAI API returned status ${response.status}`);
    }
    const data = await response.json();

    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("Azure OpenAI response missing expected content structure");
    }

    return {
      content,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      }
    };
  }
}
