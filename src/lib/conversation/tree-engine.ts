/** Phase 22: Conversation tree engine — pure functions for question flow traversal */

import type {
  QuestionFlow,
  ConversationQuestion,
  NextQuestionResult,
  FlowValidationResult,
} from "@/types/conversation";

/**
 * Get the next question in the flow given the current question and selected answer.
 * Returns the next question or a terminal classification.
 */
export function getNextQuestion(
  flow: QuestionFlow,
  currentQuestionId: string,
  selectedAnswerId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _processStepId: string, // reserved for future step-specific logic
): NextQuestionResult {
  const currentQuestion = flow.questions.find((q) => q.id === currentQuestionId);
  if (!currentQuestion) {
    return {};
  }

  const selectedAnswer = currentQuestion.answers.find((a) => a.id === selectedAnswerId);
  if (!selectedAnswer) {
    return {};
  }

  // If the answer has a classification, this is a terminal node
  if (selectedAnswer.classification) {
    return { classification: selectedAnswer.classification };
  }

  // If the answer has a next question, find it
  if (selectedAnswer.nextQuestionId) {
    const nextQuestion = flow.questions.find((q) => q.id === selectedAnswer.nextQuestionId);
    if (nextQuestion) {
      return { nextQuestion };
    }
  }

  return {};
}

/**
 * Validate a question flow tree:
 * - Root question must exist
 * - No dangling references (all nextQuestionId values must point to existing questions)
 * - All leaf answers must have a classification
 * - No cycles (via DFS)
 */
export function validateQuestionFlow(flow: QuestionFlow): FlowValidationResult {
  const errors: string[] = [];
  const questionMap = new Map<string, ConversationQuestion>();

  for (const q of flow.questions) {
    questionMap.set(q.id, q);
  }

  // Check root exists
  if (!questionMap.has(flow.rootQuestionId)) {
    errors.push(`Root question "${flow.rootQuestionId}" does not exist in the flow.`);
  }

  // Check all answer references
  for (const question of flow.questions) {
    for (const answer of question.answers) {
      if (answer.nextQuestionId && !questionMap.has(answer.nextQuestionId)) {
        errors.push(
          `Answer "${answer.id}" in question "${question.id}" references non-existent question "${answer.nextQuestionId}".`,
        );
      }
      // Leaf answers (no next question) must have a classification
      if (!answer.nextQuestionId && !answer.classification) {
        errors.push(
          `Answer "${answer.id}" in question "${question.id}" is a leaf but has no classification.`,
        );
      }
    }
  }

  // Cycle detection via DFS
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function hasCycle(questionId: string): boolean {
    if (inStack.has(questionId)) {
      return true;
    }
    if (visited.has(questionId)) {
      return false;
    }

    visited.add(questionId);
    inStack.add(questionId);

    const question = questionMap.get(questionId);
    if (question) {
      for (const answer of question.answers) {
        if (answer.nextQuestionId) {
          if (hasCycle(answer.nextQuestionId)) {
            return true;
          }
        }
      }
    }

    inStack.delete(questionId);
    return false;
  }

  if (questionMap.has(flow.rootQuestionId) && hasCycle(flow.rootQuestionId)) {
    errors.push("Question flow contains a cycle.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Estimate the remaining number of questions based on tree depth.
 * Counts the maximum depth from unanswered branches.
 */
export function estimateRemainingQuestions(
  flow: QuestionFlow,
  answeredQuestionIds: string[],
): number {
  const answeredSet = new Set(answeredQuestionIds);
  const questionMap = new Map<string, ConversationQuestion>();

  for (const q of flow.questions) {
    questionMap.set(q.id, q);
  }

  function maxDepth(questionId: string, seen: Set<string>): number {
    if (seen.has(questionId)) return 0; // prevent infinite recursion on cycles
    if (answeredSet.has(questionId)) return 0;

    const question = questionMap.get(questionId);
    if (!question) return 0;

    seen.add(questionId);
    let max = 0;

    for (const answer of question.answers) {
      if (answer.nextQuestionId) {
        const depth = maxDepth(answer.nextQuestionId, seen);
        if (depth > max) max = depth;
      }
    }

    seen.delete(questionId);
    return 1 + max;
  }

  return maxDepth(flow.rootQuestionId, new Set());
}
