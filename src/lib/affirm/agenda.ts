/**
 * Pre-release agenda + signed-record builders.
 *
 * Both run inside the release transaction (Screen 3 -> Screen 4
 * generation) and are the ONLY way these artefacts come into existence.
 * Per the master prompt, Screen 4 outputs are produced only after the
 * consultant has explicitly released; nothing is auto-sent.
 */
import type {
  AffirmChoice,
  AgendaItem,
  AgendaJson,
  SignedRecordJson,
} from "@/lib/affirm/types";

export interface ResponseRow {
  questionId: string;
  choice: AffirmChoice;
  reason: string | null;
}

export interface QuestionContext {
  id: string;
  sapVerbatim: string | null;
  consultantWording: string | null;
  plainLanguageSuggested: string | null;
  sapArea: string | null;
  sapTopic: string | null;
  subProcessName: string;
  streamName: string;
  status: string;
}

function toAgendaItem(
  q: QuestionContext,
  reason: string | null,
): AgendaItem {
  return {
    questionId: q.id,
    sapVerbatim: q.sapVerbatim ?? "",
    consultantWording: q.consultantWording,
    plainLanguageSuggested: q.plainLanguageSuggested,
    sapArea: q.sapArea,
    sapTopic: q.sapTopic,
    subProcessName: q.subProcessName,
    streamName: q.streamName,
    reason,
  };
}

/**
 * Build the Fit-to-Standard workshop agenda from the sealed responses.
 *
 *   fastConfirm = standard answers          (review + acknowledge)
 *   discuss     = explicit "discuss" picks  (open the topic in workshop)
 *   deviations  = client wants this differently (design work needed)
 *
 * Excluded questions are dropped: they were never shown to the client
 * and therefore never had a response in the first place.
 */
export function buildAgenda(
  questions: QuestionContext[],
  responses: ResponseRow[],
): AgendaJson {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const out: AgendaJson = { fastConfirm: [], discuss: [], deviations: [] };

  for (const r of responses) {
    const q = byId.get(r.questionId);
    if (!q || q.status === "excluded") continue;
    const item = toAgendaItem(q, r.reason);
    switch (r.choice) {
      case "standard":
        out.fastConfirm.push(item);
        break;
      case "discuss":
        out.discuss.push(item);
        break;
      case "deviate":
        out.deviations.push(item);
        break;
    }
  }
  return out;
}

/**
 * Build the signed affirmation record. This is the artefact the client
 * (post release) sees as the legally-meaningful summary of their
 * decisions. promptShown picks the wording the client actually saw:
 * consultant final wording when present, else the suggested
 * plain-language draft, else the SAP verbatim.
 */
export function buildSignedRecord(
  client: string,
  questions: QuestionContext[],
  responses: ResponseRow[],
  releasedAt: Date,
  releasedById: string | null,
): SignedRecordJson {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const totals = { standard: 0, discuss: 0, deviate: 0, excludedHidden: 0 };
  const decisions: SignedRecordJson["decisions"] = [];

  for (const r of responses) {
    const q = byId.get(r.questionId);
    if (!q) continue;
    if (q.status === "excluded") {
      totals.excludedHidden++;
      continue;
    }
    totals[r.choice]++;
    const promptShown =
      q.consultantWording ?? q.plainLanguageSuggested ?? q.sapVerbatim ?? "";
    decisions.push({
      questionId: q.id,
      promptShown,
      sapVerbatim: q.sapVerbatim ?? "",
      choice: r.choice,
      reason: r.reason,
    });
  }

  return {
    client,
    releasedAt: releasedAt.toISOString(),
    releasedById,
    totals,
    decisions,
  };
}
