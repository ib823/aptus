/**
 * AI Orchestrator — "Bring Your Own AI" (BYOAI) Engine
 * Handles multi-provider routing (OpenAI, Azure, Gemini) based on Org config.
 */

import { prisma } from "@/lib/db/prisma";

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
      return org.aiConfig as unknown as AIConfig;
    }

    // System Fallback (Environment Variables)
    return {
      provider: (process.env.DEFAULT_AI_PROVIDER as AIProvider) || "openai",
      apiKey: process.env.OPENAI_API_KEY || "",
      modelName: process.env.OPENAI_MODEL || "gpt-4o",
    };
  }

  private async callOpenAI(config: AIConfig, prompt: string, system?: string): Promise<AIResponse> {
    // Implementation for standard OpenAI API
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

    if (!response.ok) throw new Error(`OpenAI Error: ${await response.text()}`);
    const data = await response.json();

    return {
      content: data.choices[0].message.content,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      }
    };
  }

  private async callGemini(config: AIConfig, prompt: string, system?: string): Promise<AIResponse> {
    // Implementation for Google Gemini API
    const baseUrl = "https://generativelanguage.googleapis.com/v1beta/models";
    const model = config.modelName || "gemini-1.5-pro";
    const url = `${baseUrl}/${model}:generateContent?key=${config.apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `${system ? system + "\n\n" : ""}${prompt}` }]
        }],
      }),
    });

    if (!response.ok) throw new Error(`Gemini Error: ${await response.text()}`);
    const data = await response.json();

    return {
      content: data.candidates[0].content.parts[0].text,
      usage: {
        // Gemini API tokens mapping varies, using placeholder if not provided
        promptTokens: data.usageMetadata?.promptTokenCount || 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata?.totalTokenCount || 0,
      }
    };
  }

  private async callAzureOpenAI(config: AIConfig, prompt: string, system?: string): Promise<AIResponse> {
    if (!config.endpoint) throw new Error("Azure OpenAI requires an endpoint URL");
    
    // Azure endpoint format: https://{resource}.openai.azure.com/openai/deployments/{deployment-id}/chat/completions?api-version=2023-05-15
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

    if (!response.ok) throw new Error(`Azure Error: ${await response.text()}`);
    const data = await response.json();

    return {
      content: data.choices[0].message.content,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      }
    };
  }
}
