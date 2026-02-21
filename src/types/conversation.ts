/** Phase 22: Conversation Mode Types */

/** Classification values for process steps */
export type ClassificationValue = "FIT" | "CONFIGURE" | "GAP" | "NA";

/** Session status for conversation flow */
export type ConversationSessionStatus = "in_progress" | "completed" | "abandoned";

/** A single answer option for a conversation question */
export interface ConversationAnswer {
  id: string;
  text: string;
  /** If set, this answer leads to the specified question */
  nextQuestionId?: string | undefined;
  /** If set, this answer produces a terminal classification */
  classification?: ClassificationValue | undefined;
}

/** A single question in the conversation flow tree */
export interface ConversationQuestion {
  id: string;
  text: string;
  helpText?: string | undefined;
  answers: ConversationAnswer[];
}

/** The full question flow tree stored as JSON */
export interface QuestionFlow {
  rootQuestionId: string;
  questions: ConversationQuestion[];
}

/** A single response in a conversation session */
export interface ConversationResponse {
  questionId: string;
  answerId: string;
  answeredAt: string;
}

/** A derived classification from the conversation */
export interface DerivedClassification {
  processStepId: string;
  classification: ClassificationValue;
  confidence: "high" | "medium" | "low";
  derivedFrom: string[];
}

/** Next question result from the tree engine */
export interface NextQuestionResult {
  nextQuestion?: ConversationQuestion | undefined;
  classification?: ClassificationValue | undefined;
}

/** Validation result for a question flow */
export interface FlowValidationResult {
  valid: boolean;
  errors: string[];
}
