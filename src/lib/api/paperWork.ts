import { api } from "./client";

/**
 * PAPER WORK, TYPED: the route for a child with no camera (Lydia, 25 Nov,
 * L59: "the server accepts typed steps and says whether they matched").
 *
 * `POST /api/v1/students/me/lessons/{lesson_id}/paper-work/typed`
 * (`TypedPaperWorkWrite` -> `TypedPaperWorkResponse`, live). The steps are a
 * check's own guided steps, every one and in their order, each with what the
 * child typed (the server answers 422 `paper_work_steps_out_of_order`
 * otherwise, and 409 where the check's steps are not approved or cannot be
 * marked). `clientSubmissionId` makes a send that is sent again the same
 * submission, not a second one.
 *
 * It never passes the check (`countsAsCheckPass` is always false): it is
 * evidence of the working, marked step by step.
 */
export interface TypedPaperStep {
  stepId: string;
  answer: string;
}

export interface TypedPaperWorkWrite {
  sessionId: string;
  segmentId: string;
  questionId: string;
  clientSubmissionId?: string | null;
  steps: TypedPaperStep[];
}

export interface TypedPaperWorkResponse {
  evidenceId: string;
  status: "matched" | "needs_work";
  marks: { stepId: string; matched: boolean }[];
  recordedAt: string;
  countsAsCheckPass?: false;
  source?: "typed_no_camera";
}

export const paperWorkApi = {
  submitTyped: (lessonId: string, body: TypedPaperWorkWrite) =>
    api.post<TypedPaperWorkResponse>(
      `/api/v1/students/me/lessons/${encodeURIComponent(lessonId)}/paper-work/typed`,
      body,
    ),
};
