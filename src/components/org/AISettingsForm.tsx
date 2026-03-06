"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Bot, ShieldCheck, Zap } from "lucide-react";
import type { AIConfig, AIProvider } from "@/lib/intelligence/ai-orchestrator";

interface AISettingsFormProps {
  organizationId: string;
  initialConfig: AIConfig | null;
}

export function AISettingsForm({ organizationId, initialConfig }: AISettingsFormProps) {
  const [provider, setProvider] = useState<AIProvider>(initialConfig?.provider || "openai");
  const [apiKey, setApiKey] = useState(initialConfig?.apiKey ? "********" : "");
  const [endpoint, setEndpoint] = useState(initialConfig?.endpoint || "");
  const [modelName, setModelName] = useState(initialConfig?.modelName || "");
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/ai-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: apiKey === "********" ? undefined : apiKey, // Don't overwrite if not changed
          endpoint,
          modelName,
        }),
      });

      if (res.ok) {
        toast.success("AI Configuration updated successfully");
      } else {
        toast.error("Failed to update AI configuration");
      }
    } catch {
      toast.error("An error occurred while saving");
    } finally {
      setSaving(false);
    }
  }, [organizationId, provider, apiKey, endpoint, modelName]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="size-5 text-blue-600" />
            <CardTitle>Bring Your Own AI</CardTitle>
          </div>
          <CardDescription>
            Configure your own AI subscription to handle gap analysis and intelligent mapping.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>AI Provider</Label>
            <Select value={provider} onValueChange={(val) => setProvider(val as AIProvider)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI (Direct)</SelectItem>
                <SelectItem value="azure">Azure OpenAI (Enterprise)</SelectItem>
                <SelectItem value="gemini">Google Gemini</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>API Key</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="font-mono"
            />
            <p className="text-[10px] text-muted-foreground">
              Your key is AES-256 encrypted at rest and never used for training.
            </p>
          </div>

          {provider === "azure" && (
            <div className="space-y-2">
              <Label>Azure Endpoint URL</Label>
              <Input
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="https://your-resource.openai.azure.com/..."
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Model Name (Optional)</Label>
            <Input
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder={provider === "gemini" ? "gemini-1.5-pro" : "gpt-4o"}
            />
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
            {saving ? "Saving..." : "Save AI Configuration"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg flex gap-3">
          <ShieldCheck className="size-5 text-blue-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-blue-900">Enterprise Privacy</p>
            <p className="text-xs text-blue-700 mt-1">
              By using your own API key, all assessment data stays within your authorized AI environment.
            </p>
          </div>
        </div>
        <div className="p-4 bg-green-50 border border-green-100 rounded-lg flex gap-3">
          <Zap className="size-5 text-green-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-900">Direct Billing</p>
            <p className="text-xs text-green-700 mt-1">
              AI usage costs are billed directly to your provider account with no platform markup.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
