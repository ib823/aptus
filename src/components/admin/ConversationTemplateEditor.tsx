"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, AlertCircle, Eye, Save } from "lucide-react";
import type { QuestionFlow, ConversationQuestion, ConversationAnswer, ClassificationValue } from "@/types/conversation";
import { validateQuestionFlow } from "@/lib/conversation/tree-engine";

interface ConversationTemplateEditorProps {
  scopeItemId: string;
  processStepId: string;
  initialFlow?: QuestionFlow | undefined;
  onSave: (flow: QuestionFlow) => Promise<void>;
}

const CLASSIFICATION_OPTIONS: Array<{ value: ClassificationValue; label: string; color: string }> = [
  { value: "FIT", label: "FIT", color: "bg-green-100 text-green-700" },
  { value: "CONFIGURE", label: "CONFIGURE", color: "bg-blue-100 text-blue-700" },
  { value: "GAP", label: "GAP", color: "bg-amber-100 text-amber-700" },
  { value: "NA", label: "N/A", color: "bg-gray-100 text-gray-600" },
];

function generateId(): string {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptyQuestion(): ConversationQuestion {
  return {
    id: generateId(),
    text: "",
    answers: [
      { id: generateId(), text: "", classification: "FIT" },
      { id: generateId(), text: "", classification: "GAP" },
    ],
  };
}

export function ConversationTemplateEditor({
  initialFlow,
  onSave,
}: ConversationTemplateEditorProps) {
  const [questions, setQuestions] = useState<ConversationQuestion[]>(
    initialFlow?.questions ?? [createEmptyQuestion()],
  );
  const [rootQuestionId, setRootQuestionId] = useState(
    initialFlow?.rootQuestionId ?? questions[0]?.id ?? "",
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [previewQuestionId, setPreviewQuestionId] = useState<string | null>(null);

  const updateQuestion = useCallback((questionId: string, updates: Partial<ConversationQuestion>) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === questionId ? { ...q, ...updates } : q)),
    );
  }, []);

  const updateAnswer = useCallback((questionId: string, answerId: string, updates: Partial<ConversationAnswer>) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== questionId) return q;
        return {
          ...q,
          answers: q.answers.map((a) => (a.id === answerId ? { ...a, ...updates } : a)),
        };
      }),
    );
  }, []);

  const addQuestion = useCallback(() => {
    const newQ = createEmptyQuestion();
    setQuestions((prev) => [...prev, newQ]);
  }, []);

  const removeQuestion = useCallback((questionId: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== questionId));
    if (rootQuestionId === questionId && questions.length > 1) {
      const remaining = questions.filter((q) => q.id !== questionId);
      setRootQuestionId(remaining[0]?.id ?? "");
    }
  }, [rootQuestionId, questions]);

  const addAnswer = useCallback((questionId: string) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== questionId) return q;
        if (q.answers.length >= 8) return q;
        return {
          ...q,
          answers: [...q.answers, { id: generateId(), text: "", classification: "FIT" as ClassificationValue }],
        };
      }),
    );
  }, []);

  const removeAnswer = useCallback((questionId: string, answerId: string) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== questionId) return q;
        if (q.answers.length <= 2) return q;
        return { ...q, answers: q.answers.filter((a) => a.id !== answerId) };
      }),
    );
  }, []);

  const handleSave = useCallback(async () => {
    const flow: QuestionFlow = { rootQuestionId, questions };
    const result = validateQuestionFlow(flow);
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      await onSave(flow);
    } finally {
      setSaving(false);
    }
  }, [rootQuestionId, questions, onSave]);

  // Preview mode: walk through the tree
  if (previewMode) {
    const flow: QuestionFlow = { rootQuestionId, questions };
    const currentQ = questions.find((q) => q.id === (previewQuestionId ?? rootQuestionId));

    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Preview Mode</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setPreviewMode(false); setPreviewQuestionId(null); }}
            >
              Exit Preview
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {currentQ ? (
            <div className="space-y-4">
              <p className="text-sm font-medium">{currentQ.text || "(empty question)"}</p>
              {currentQ.helpText && (
                <p className="text-xs text-muted-foreground">{currentQ.helpText}</p>
              )}
              <div className="space-y-2">
                {currentQ.answers.map((a) => (
                  <button
                    key={a.id}
                    className="w-full text-left p-3 rounded-md border hover:bg-muted/50 text-sm"
                    onClick={() => {
                      if (a.classification) {
                        setPreviewQuestionId(null);
                        setPreviewMode(false);
                      } else if (a.nextQuestionId) {
                        setPreviewQuestionId(a.nextQuestionId);
                      }
                    }}
                  >
                    {a.text || "(empty answer)"}
                    {a.classification && (
                      <Badge className="ml-2" variant="outline">{a.classification}</Badge>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {flow.questions.length === 0 ? "No questions defined." : "Question not found."}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <div className="flex items-center gap-2 text-red-700 text-sm font-medium mb-1">
            <AlertCircle className="h-4 w-4" />
            Validation Errors
          </div>
          <ul className="list-disc list-inside text-xs text-red-600 space-y-1">
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">Root Question:</label>
        <select
          className="text-sm border rounded px-2 py-1"
          value={rootQuestionId}
          onChange={(e) => setRootQuestionId(e.target.value)}
        >
          {questions.map((q) => (
            <option key={q.id} value={q.id}>
              {q.text || `(Question ${questions.indexOf(q) + 1})`}
            </option>
          ))}
        </select>
      </div>

      {questions.map((question, qi) => (
        <Card key={question.id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">
                Question {qi + 1}
                {question.id === rootQuestionId && (
                  <Badge className="ml-2 bg-blue-100 text-blue-700" variant="outline">Root</Badge>
                )}
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeQuestion(question.id)}
                disabled={questions.length <= 1}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="text"
              className="w-full text-sm border rounded px-3 py-2"
              placeholder="Question text..."
              value={question.text}
              onChange={(e) => updateQuestion(question.id, { text: e.target.value })}
            />
            <input
              type="text"
              className="w-full text-xs border rounded px-3 py-1.5 text-muted-foreground"
              placeholder="Help text (optional)..."
              value={question.helpText ?? ""}
              onChange={(e) => updateQuestion(question.id, { helpText: e.target.value || undefined })}
            />

            <div className="space-y-2 pl-4 border-l-2">
              {question.answers.map((answer, ai) => (
                <div key={answer.id} className="flex items-start gap-2">
                  <div className="flex-1 space-y-1">
                    <input
                      type="text"
                      className="w-full text-xs border rounded px-2 py-1.5"
                      placeholder={`Answer ${ai + 1}...`}
                      value={answer.text}
                      onChange={(e) => updateAnswer(question.id, answer.id, { text: e.target.value })}
                    />
                    <div className="flex items-center gap-2">
                      <select
                        className="text-xs border rounded px-1.5 py-1"
                        value={answer.nextQuestionId ? "next" : "terminal"}
                        onChange={(e) => {
                          if (e.target.value === "terminal") {
                            updateAnswer(question.id, answer.id, {
                              nextQuestionId: undefined,
                              classification: "FIT",
                            });
                          } else {
                            const otherQ = questions.find((q) => q.id !== question.id);
                            updateAnswer(question.id, answer.id, {
                              classification: undefined,
                              nextQuestionId: otherQ?.id ?? "",
                            });
                          }
                        }}
                      >
                        <option value="terminal">Terminal (classify)</option>
                        <option value="next">Go to question</option>
                      </select>
                      {answer.classification ? (
                        <select
                          className="text-xs border rounded px-1.5 py-1"
                          value={answer.classification}
                          onChange={(e) => updateAnswer(question.id, answer.id, { classification: e.target.value as ClassificationValue })}
                        >
                          {CLASSIFICATION_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      ) : (
                        <select
                          className="text-xs border rounded px-1.5 py-1"
                          value={answer.nextQuestionId ?? ""}
                          onChange={(e) => updateAnswer(question.id, answer.id, { nextQuestionId: e.target.value })}
                        >
                          <option value="">Select question...</option>
                          {questions.filter((q) => q.id !== question.id).map((q) => (
                            <option key={q.id} value={q.id}>
                              {q.text || `Question ${questions.indexOf(q) + 1}`}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeAnswer(question.id, answer.id)}
                    disabled={question.answers.length <= 2}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              {question.answers.length < 8 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => addAnswer(question.id)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Answer
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={addQuestion}>
          <Plus className="h-4 w-4 mr-1" />
          Add Question
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setPreviewMode(true); setPreviewQuestionId(null); }}
        >
          <Eye className="h-4 w-4 mr-1" />
          Preview
        </Button>
        <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
          <Save className="h-4 w-4 mr-1" />
          {saving ? "Saving..." : "Save Template"}
        </Button>
      </div>
    </div>
  );
}
