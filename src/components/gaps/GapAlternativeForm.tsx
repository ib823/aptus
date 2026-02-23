"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

interface AlternativeFormData {
  label: string;
  resolutionType: string;
  resolutionDescription: string;
  oneTimeCost: number | null;
  recurringCost: number | null;
  implementationDays: number | null;
  riskLevel: string | null;
  rationale: string | null;
  pros: string[];
  cons: string[];
}

interface GapAlternativeFormProps {
  initial?: Partial<AlternativeFormData>;
  onSave: (data: AlternativeFormData) => void;
  onCancel: () => void;
  saving?: boolean;
}

const RESOLUTION_OPTIONS = [
  { value: "CONFIGURE", label: "Configure" },
  { value: "KEY_USER_EXT", label: "Key User Extension" },
  { value: "BTP_EXT", label: "BTP Extension" },
  { value: "ISV", label: "ISV Solution" },
  { value: "CUSTOM_ABAP", label: "Custom ABAP" },
  { value: "ADAPT_PROCESS", label: "Adapt Process" },
  { value: "OUT_OF_SCOPE", label: "Out of Scope" },
];

export function GapAlternativeForm({ initial, onSave, onCancel, saving }: GapAlternativeFormProps) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [resolutionType, setResolutionType] = useState(initial?.resolutionType ?? "");
  const [description, setDescription] = useState(initial?.resolutionDescription ?? "");
  const [oneTimeCost, setOneTimeCost] = useState<string>(initial?.oneTimeCost?.toString() ?? "");
  const [recurringCost, setRecurringCost] = useState<string>(initial?.recurringCost?.toString() ?? "");
  const [implDays, setImplDays] = useState<string>(initial?.implementationDays?.toString() ?? "");
  const [riskLevel, setRiskLevel] = useState(initial?.riskLevel ?? "");
  const [rationale, setRationale] = useState(initial?.rationale ?? "");
  const [pros, setPros] = useState<string[]>(initial?.pros ?? []);
  const [cons, setCons] = useState<string[]>(initial?.cons ?? []);
  const [proInput, setProInput] = useState("");
  const [conInput, setConInput] = useState("");

  const isValid = label.trim().length > 0 && resolutionType.length > 0 && description.trim().length > 0;

  const handleSubmit = () => {
    if (!isValid) return;
    onSave({
      label: label.trim(),
      resolutionType,
      resolutionDescription: description.trim(),
      oneTimeCost: oneTimeCost ? Number(oneTimeCost) : null,
      recurringCost: recurringCost ? Number(recurringCost) : null,
      implementationDays: implDays ? Number(implDays) : null,
      riskLevel: riskLevel || null,
      rationale: rationale.trim() || null,
      pros,
      cons,
    });
  };

  const addPro = () => {
    if (proInput.trim() && pros.length < 10) {
      setPros([...pros, proInput.trim()]);
      setProInput("");
    }
  };

  const addCon = () => {
    if (conInput.trim() && cons.length < 10) {
      setCons([...cons, conInput.trim()]);
      setConInput("");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-lg border shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">
            {initial ? "Edit Alternative" : "Add Alternative Resolution"}
          </h3>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-6 space-y-4">
          {/* Label */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Label *
            </label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., BTP Extension Alternative"
              className="mt-1"
            />
          </div>

          {/* Resolution Type */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Resolution Type *
            </label>
            <Select value={resolutionType} onValueChange={setResolutionType}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {RESOLUTION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Description *
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the alternative approach..."
              className="mt-1 min-h-[80px]"
            />
          </div>

          {/* Cost & Effort */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">One-Time Cost</label>
              <Input
                type="number"
                value={oneTimeCost}
                onChange={(e) => setOneTimeCost(e.target.value)}
                placeholder="0"
                className="mt-1 h-8 text-xs"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Recurring/yr</label>
              <Input
                type="number"
                value={recurringCost}
                onChange={(e) => setRecurringCost(e.target.value)}
                placeholder="0"
                className="mt-1 h-8 text-xs"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Impl. Days</label>
              <Input
                type="number"
                value={implDays}
                onChange={(e) => setImplDays(e.target.value)}
                placeholder="0"
                className="mt-1 h-8 text-xs"
              />
            </div>
          </div>

          {/* Risk Level */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Risk Level
            </label>
            <Select value={riskLevel} onValueChange={setRiskLevel}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select risk" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Rationale */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Rationale
            </label>
            <Textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Why consider this alternative?"
              className="mt-1 min-h-[60px]"
            />
          </div>

          {/* Pros */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Pros
            </label>
            <div className="flex gap-2 mt-1">
              <Input
                value={proInput}
                onChange={(e) => setProInput(e.target.value)}
                placeholder="Add a pro..."
                className="h-8 text-xs"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPro(); } }}
              />
              <Button size="sm" variant="outline" onClick={addPro} disabled={!proInput.trim()}>+</Button>
            </div>
            {pros.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {pros.map((p, i) => (
                  <Badge key={i} variant="outline" className="text-xs text-green-700 bg-green-50">
                    {p}
                    <button onClick={() => setPros(pros.filter((_, j) => j !== i))} className="ml-1">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Cons */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Cons
            </label>
            <div className="flex gap-2 mt-1">
              <Input
                value={conInput}
                onChange={(e) => setConInput(e.target.value)}
                placeholder="Add a con..."
                className="h-8 text-xs"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCon(); } }}
              />
              <Button size="sm" variant="outline" onClick={addCon} disabled={!conInput.trim()}>+</Button>
            </div>
            {cons.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {cons.map((c, i) => (
                  <Badge key={i} variant="outline" className="text-xs text-red-700 bg-red-50">
                    {c}
                    <button onClick={() => setCons(cons.filter((_, j) => j !== i))} className="ml-1">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!isValid || saving}>
            {saving ? "Saving..." : initial ? "Update" : "Add Alternative"}
          </Button>
        </div>
      </div>
    </div>
  );
}
