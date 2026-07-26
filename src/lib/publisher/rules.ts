import type { ProjectConfig } from "@/lib/schemas/projects";
import type { ReviewPackage } from "@/lib/schemas";

/** TZ §4.2 — two-part reviews only for Nancy. */
export function usesTwoPhaseReview(project: Pick<ProjectConfig, "id" | "twoPhaseReview">): boolean {
  return project.id === "nancy" && project.twoPhaseReview === true;
}

/** TZ §3.2 — full review must include photo / circle / video. */
export function hasLiveMedia(review: Pick<ReviewPackage, "media">): boolean {
  return review.media.some((m) => m.type === "video_note" || m.type === "photo" || m.type === "voice");
}
