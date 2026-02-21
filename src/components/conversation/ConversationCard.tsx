"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageCircle, ArrowRight } from "lucide-react";
import type { ConversationQuestion, ConversationResponse } from "@/types/conversation";

interface ConversationCardProps {
  question: ConversationQuestion;
  responses: ConversationResponse[];
  onAnswer: (questionId: string, answerId: string) => void;
  isLoading?: boolean | undefined;
}

export function ConversationCard({
  question,
  responses,
  onAnswer,
  isLoading,
}: ConversationCardProps) {
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null);
  const isAnswered = responses.some((r) => r.questionId === question.id);

  const handleSubmit = () => {
    if (selectedAnswerId) {
      onAnswer(question.id, selectedAnswerId);
      setSelectedAnswerId(null);
    }
  };

  return (
    <Card className="border-l-4 border-l-blue-400">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
            <MessageCircle className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <CardTitle className="text-base">{question.text}</CardTitle>
            {question.helpText && (
              <p className="text-sm text-muted-foreground mt-1">{question.helpText}</p>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 ml-11">
          {question.answers.map((answer) => (
            <button
              key={answer.id}
              onClick={() => !isAnswered && setSelectedAnswerId(answer.id)}
              disabled={isAnswered || (isLoading ?? false)}
              className={`w-full text-left p-3 rounded-lg border transition-all ${
                selectedAnswerId === answer.id
                  ? "border-blue-400 bg-blue-50 ring-1 ring-blue-400"
                  : "border hover:bg-accent"
              } ${isAnswered ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                    selectedAnswerId === answer.id ? "border-blue-500" : "border-muted-foreground/40"
                  }`}
                >
                  {selectedAnswerId === answer.id && (
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                  )}
                </div>
                <span className="text-sm">{answer.text}</span>
              </div>
            </button>
          ))}
        </div>
        {!isAnswered && selectedAnswerId && (
          <div className="mt-4 ml-11">
            <Button
              onClick={handleSubmit}
              disabled={isLoading ?? false}
              size="sm"
              className="gap-2"
            >
              Continue
              <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
