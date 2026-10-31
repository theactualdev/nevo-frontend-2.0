"use client";

import { useState } from "react";
import { MediaTile, PlayButton, duration, useNarrationSampler } from "@/components/teacher/Media/MediaPieces";
import { cn } from "@/lib/utils";
import { CAPTION_MAX, CAPTION_MIN, type VisualCaptionReview } from "@/lib/api/media";
import { plural, wasRemade, type MediaRow, type MediaView } from "./reviewModel";

/**
 * C07k step 1's pictures and narration (SCRUM-286; design 82c213b, 23 Oct).
 *
 * PICTURES AND NARRATION ARE NOT THE SAME RISK (Lydia, 23 Oct). A picture is
 * made independently of the text and can be wrong in ways the text is not, so
 * pictures are laid out as tiles to be glanced across, where a wrong one
 * catches the eye. A recording is read from text the teacher already approved,
 * so what can go wrong is how it sounds: they are listed to be sampled, not
 * sat through.
 *
 * A FLAG IS THE ONLY FRICTION, and it has a consequence: a flagged item is
 * sent back to be made again instead of approved. Everything not flagged goes
 * with the step's one press.
 *
 * THE FOUR SCENARIOS the frame draws are all here: both, pictures only,
 * narration only, and none - which says the lesson is complete as text rather
 * than looking like a step that failed to load.
 */

/** How many tiles and rows show before "+ N more", as the 73-section frame draws. */
const PICTURES_SHOWN = 12;
const RECORDINGS_SHOWN = 6;

const SECTION_LABEL =
  "font-mono text-[11px] font-bold tracking-[0.08em] text-nevo-near-black/50 uppercase";
const NOTE = "text-[12.5px] text-nevo-near-black/55";
const GUIDE = "mt-[7px] text-[13px] leading-[1.5] text-nevo-near-black/60";

function FlagIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 21V4a1 1 0 0 1 1-1h11l-2 4 2 4H6" />
    </svg>
  );
}

/** "1 section has none" / "3 flagged for a change" / "every section". */
function coverNote(flagged: number, without: number, flaggedWord: string): string {
  if (flagged > 0) return `${flagged} ${flaggedWord}`;
  if (without > 0) return `${without} ${without === 1 ? "section has" : "sections have"} none`;
  return "every section";
}

export function StepMedia({
  media,
  remade = new Set(),
  flagged,
  onFlag,
  approved,
  working,
  onRetry,
  retrying,
  retryRefusal,
  captions,
}: {
  media: MediaView;
  /**
   * Items this teacher flagged and sent back in this visit, beside the
   * server's own `remadeAt` (see `wasRemade`). One that is waiting again is
   * the remake, and says so (design 11; Lydia, 26 Oct: "A teacher who flagged
   * something and sees an identical picture will either flag it again or
   * assume we ignored them").
   */
  remade?: ReadonlySet<string>;
  flagged: ReadonlySet<string>;
  onFlag: (mediaId: string) => void;
  /** Nothing shown is still waiting: this step's media is approved. */
  approved: boolean;
  working: boolean;
  onRetry: (mediaId: string) => void;
  retrying: string | null;
  retryRefusal: (mediaId: string) => string | null;
  /** New captions waiting for a teacher (Lydia, 31 Oct, Q10). */
  captions?: CaptionsProps;
}) {
  const [allPictures, setAllPictures] = useState(false);
  const [allRecordings, setAllRecordings] = useState(false);
  const sampler = useNarrationSampler();

  const captionsBlock = captions && <Captions {...captions} />;
  /*
   * A caption belongs to a live picture, which may predate the media list -
   * so a lesson with nothing in that list can still have captions waiting,
   * and is then not "text only".
   */
  if (!media.exists && captions && captions.items.length > 0) {
    return <div>{captionsBlock}</div>;
  }

  if (!media.exists) {
    return (
      <>
      <div className="mt-[26px] flex items-center gap-[15px] rounded-[12px] bg-nevo-cream-elevated p-[22px] shadow-elevation-1">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-nevo-violet/20 text-nevo-navy">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 7h16M4 12h16M4 17h10" />
          </svg>
        </span>
        <div>
          <p className="text-[13.5px] font-semibold text-nevo-near-black xl:text-[14.5px]">
            This lesson is text only
          </p>
          <p className="mt-1 text-[13.5px] leading-[1.5] text-pretty text-nevo-near-black/62">
            Nevo made no pictures or narration for this one. It&rsquo;s complete
            as it is - children will read it.
          </p>
        </div>
      </div>
      {/* Only ever the "couldn't check" line here: with any caption, the
          branch above shows them instead. */}
      {captionsBlock}
      </>
    );
  }

  // A flagged one moves to the front, as the frame sorts it.
  const byFlag = (a: MediaRow, b: MediaRow) =>
    Number(flagged.has(b.item.id)) - Number(flagged.has(a.item.id));
  const pictures = [...media.pictures].sort(byFlag);
  const recordings = [...media.recordings].sort(byFlag);
  const shownPictures = allPictures ? pictures : pictures.slice(0, PICTURES_SHOWN);
  const shownRecordings = allRecordings ? recordings : recordings.slice(0, RECORDINGS_SHOWN);
  const flaggedPictures = pictures.filter((p) => flagged.has(p.item.id)).length;
  const flaggedRecordings = recordings.filter((r) => flagged.has(r.item.id)).length;
  /** Back from a remake, and waiting for a look - whoever asked for it. */
  const isRemade = (row: MediaRow) => wasRemade(row.item, remade);

  // Once approved, a flag has nothing left to act on.
  const canFlag = (row: MediaRow) => !approved && row.item.status === "awaiting_review" && !working;

  const making = media.making.images + media.making.audio;

  return (
    <div>
      {pictures.length > 0 ? (
        <div className="mt-[26px]">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className={SECTION_LABEL}>{`Pictures · ${pictures.length} made`}</span>
            <span className={NOTE}>
              {coverNote(flaggedPictures, media.sectionsWithoutPictures, "flagged for a change")}
            </span>
          </div>
          <p className={GUIDE}>
            Glance across them, so a wrong one catches your eye. Flag any that
            looks off; the rest keep.
          </p>
          <div className="mt-3.5 grid grid-cols-[repeat(auto-fill,minmax(124px,1fr))] gap-3 xl:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
            {shownPictures.map((row) => {
              const isFlagged = flagged.has(row.item.id);
              const image = row.item.asset!.image!;
              return (
                <div key={row.item.id} className="group">
                  <MediaTile
                    image={image}
                    alt={image.caption || `A picture for ${row.label}`}
                    className={cn(
                      "border-[1.5px] border-solid",
                      isFlagged ? "border-nevo-violet" : "border-transparent",
                    )}
                  >
                    {canFlag(row) && (
                      <button
                        type="button"
                        onClick={() => onFlag(row.item.id)}
                        aria-pressed={isFlagged}
                        aria-label={isFlagged ? `Unflag the picture for ${row.label}` : `Flag the picture for ${row.label}`}
                        className={cn(
                          "absolute top-[7px] right-[7px] inline-flex size-[27px] cursor-pointer items-center justify-center rounded-full border-none shadow-[0_1px_4px_rgba(0,0,0,0.2)] transition-opacity duration-150 focus-visible:opacity-100 motion-reduce:opacity-100 [@media(hover:none)]:opacity-100",
                          isFlagged
                            ? "bg-nevo-violet text-nevo-cream opacity-100"
                            : "bg-nevo-cream text-nevo-navy opacity-0 group-hover:opacity-100",
                        )}
                      >
                        <FlagIcon />
                      </button>
                    )}
                    {isFlagged ? (
                      <span className="absolute bottom-[7px] left-[7px] rounded-full bg-nevo-violet/32 px-[9px] py-0.5 text-[10px] font-semibold text-nevo-navy">
                        Flagged
                      </span>
                    ) : (
                      isRemade(row) && (
                        <span className="absolute bottom-[7px] left-[7px] rounded-full bg-nevo-navy px-[9px] py-0.5 text-[10px] font-semibold text-nevo-cream">
                          Remade
                        </span>
                      )
                    )}
                  </MediaTile>
                  <span className="mt-[7px] block text-[12px] leading-[1.3] text-nevo-near-black/60">
                    {row.label}
                  </span>
                </div>
              );
            })}
          </div>
          {pictures.length > PICTURES_SHOWN && !allPictures && (
            <button type="button" onClick={() => setAllPictures(true)} className={cn(NOTE, "mt-[11px] cursor-pointer border-none bg-transparent p-0 hover:text-nevo-navy")}>
              {`+ ${pictures.length - PICTURES_SHOWN} more pictures`}
            </button>
          )}
        </div>
      ) : (
        media.making.images === 0 && (
          <p className="mt-[22px] text-[13px] text-nevo-near-black/50">
            No pictures were made for this lesson.
          </p>
        )
      )}

      {captionsBlock}

      {recordings.length > 0 ? (
        <div className="mt-[26px]">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className={SECTION_LABEL}>{`Narration · ${plural(recordings.length, "recording", "recordings")}`}</span>
            <span className={NOTE}>
              {coverNote(flaggedRecordings, media.sectionsWithoutNarration, "flagged")}
            </span>
          </div>
          <p className={GUIDE}>
            Made from text you&rsquo;ve already approved, so play a few to hear
            how they sound rather than every one.
          </p>
          <div className="mt-3.5 overflow-hidden rounded-[12px] bg-nevo-cream-elevated shadow-elevation-1">
            {shownRecordings.map((row) => {
              const isFlagged = flagged.has(row.item.id);
              const audio = row.item.asset!.audio!;
              const playing = sampler.playing === row.item.id;
              const unplayable = sampler.unplayable.has(row.item.id);
              return (
                <div
                  key={row.item.id}
                  className="group flex items-center gap-[13px] border-b border-nevo-near-black/6 px-[15px] py-[11px] last:border-b-0"
                >
                  <PlayButton
                    playing={playing}
                    label={`the narration for ${row.label}`}
                    onClick={() => sampler.toggle(row.item.id, audio)}
                    disabled={unplayable}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-nevo-near-black xl:text-[15px]">
                      {row.label}
                      {isRemade(row) && !isFlagged && (
                        <span className="rounded-full bg-nevo-navy px-2 py-px text-[10.5px] font-semibold text-nevo-cream">
                          Remade
                        </span>
                      )}
                    </div>
                    {playing && (
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-nevo-navy/14">
                        <span className="block h-full rounded-full bg-nevo-navy" style={{ width: `${Math.max(4, sampler.progress * 100)}%` }} />
                      </div>
                    )}
                    {unplayable && (
                      <span className="mt-0.5 block text-[12px] text-nevo-near-black/55">
                        This one won&rsquo;t play just now.
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 text-[12.5px] text-nevo-near-black/50 tabular-nums">
                    {duration(audio.durationMs)}
                  </span>
                  {canFlag(row) && (
                    <button
                      type="button"
                      onClick={() => onFlag(row.item.id)}
                      aria-pressed={isFlagged}
                      aria-label={isFlagged ? `Unflag the narration for ${row.label}` : `Flag the narration for ${row.label}`}
                      className={cn(
                        "h-7 shrink-0 cursor-pointer rounded-full border-[1.5px] border-solid px-3 text-[12px] font-semibold text-nevo-navy transition-opacity duration-150 focus-visible:opacity-100 motion-reduce:opacity-100 [@media(hover:none)]:opacity-100",
                        isFlagged
                          ? "border-nevo-violet bg-nevo-violet/22 opacity-100"
                          : "border-nevo-navy/22 bg-transparent opacity-0 group-hover:opacity-100",
                      )}
                    >
                      {isFlagged ? "Flagged" : "Flag"}
                    </button>
                  )}
                </div>
              );
            })}
            {recordings.length > RECORDINGS_SHOWN && !allRecordings && (
              <button type="button" onClick={() => setAllRecordings(true)} className={cn(NOTE, "w-full cursor-pointer border-none bg-transparent px-[15px] py-[11px] text-left hover:text-nevo-navy")}>
                {`+ ${recordings.length - RECORDINGS_SHOWN} more recordings`}
              </button>
            )}
          </div>
        </div>
      ) : (
        media.making.audio === 0 && (
          <p className="mt-[18px] text-[13px] text-nevo-near-black/50">
            No narration was made for this lesson.
          </p>
        )
      )}

      {/* NOT DRAWN, and raised: the upload opens for review before its media
          is finished, so some can still be on its way. It is not part of this
          approval and waits for its own when it arrives. */}
      {making > 0 && (
        <p role="status" className="mt-[18px] text-[13px] leading-[1.5] text-nevo-near-black/60">
          {`Nevo is still making ${[
            media.making.images > 0 ? plural(media.making.images, "picture", "pictures") : "",
            media.making.audio > 0 ? plural(media.making.audio, "recording", "recordings") : "",
          ].filter(Boolean).join(" and ")}. You can carry on; they'll wait here for you.`}
        </p>
      )}

      {/* NOT DRAWN either: ones Nevo could not make. Each has its action. */}
      {media.failed.length > 0 && (
        <div className="mt-[18px]">
          <p className="text-[13px] leading-[1.5] text-nevo-near-black/60">
            {media.failed.length === 1
              ? "Nevo couldn’t make one of these."
              : `Nevo couldn’t make ${media.failed.length} of these.`}
          </p>
          <ul className="mt-2 flex list-none flex-col gap-1.5 p-0">
            {media.failed.map((row) => (
              <li key={row.item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-nevo-near-black/72">
                <span>{`${row.item.kind === "image" ? "The picture" : "The narration"} for ${row.label}`}</span>
                <button
                  type="button"
                  onClick={() => onRetry(row.item.id)}
                  disabled={retrying !== null || working}
                  className="cursor-pointer border-none bg-transparent p-0 text-[12.5px] font-semibold text-nevo-navy underline underline-offset-[3px] disabled:cursor-default disabled:opacity-55"
                >
                  {retrying === row.item.id ? "Asking…" : "Try again"}
                </button>
                {retryRefusal(row.item.id) && (
                  <span role="alert" className="basis-full text-[12.5px] font-medium text-nevo-navy">
                    {retryRefusal(row.item.id)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export interface CaptionsProps {
  items: VisualCaptionReview[];
  /** The captions could not be read: say so, never "none". */
  failed: boolean;
  /** Held back from the step's press, as a flagged picture is (by section id). */
  held: ReadonlySet<string>;
  onHold: (segmentId: string) => void;
  /** Save a teacher's own caption; saving it approves it. */
  onSave: (segmentId: string, caption: string) => Promise<boolean>;
  /** The section whose caption is being saved, if any. */
  saving: string | null;
  /** The step's press is running. */
  locked: boolean;
  refusal: (segmentId: string) => string | null;
}

/**
 * A picture's new caption, beside the pictures (Lydia, 31 Oct, Q10: "Yes,
 * build it"; the 28 Oct proposal she approved).
 *
 * Each caption sits under its own picture - the one the server says it was
 * written for - with the picture's own Flag and a way to write your own. The
 * step's one press approves the pictures and these captions together; a
 * flagged caption is held back from it and keeps waiting. Saving your own
 * approves it at once, as the server does.
 *
 * Not offered: retrying a check that could not run (`retry-unavailable`). No
 * read says which pictures that would be, so a button for it would act blind.
 */
function Captions({ items, failed, held, onHold, onSave, saving, locked, refusal }: CaptionsProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (items.length === 0) {
    return failed ? (
      <p className={cn(NOTE, "mt-[22px]")}>
        We couldn&rsquo;t check this lesson&rsquo;s picture captions just now.
      </p>
    ) : null;
  }

  const heldCount = items.filter((c) => held.has(c.segmentId)).length;
  const length = draft.trim().replace(/\s+/g, " ").length;

  return (
    <div className="mt-[26px]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className={SECTION_LABEL}>{`New captions · ${items.length} waiting`}</span>
        {heldCount > 0 && <span className={NOTE}>{`${heldCount} flagged`}</span>}
      </div>
      <p className={GUIDE}>
        These pictures were checked again, and Nevo wrote each one a new
        caption. Flag any you&rsquo;d rather not use yet, or write your own.
      </p>
      <div className="mt-3.5 flex flex-col gap-3">
        {items.map((item) => {
          const label = item.segmentTitle || "this section";
          const isHeld = held.has(item.segmentId);
          const isEditing = editing === item.segmentId;
          const isSaving = saving === item.segmentId;
          const said = refusal(item.segmentId);
          return (
            <div
              key={item.segmentId}
              className="group flex gap-3.5 rounded-[12px] bg-nevo-cream-elevated p-3 shadow-elevation-1 max-md:flex-col"
            >
              <div className="w-[150px] shrink-0 max-md:w-full">
                {item.imageUrl ? (
                  <MediaTile
                    image={{ imageUrl: item.imageUrl }}
                    alt={item.caption}
                    className={cn(
                      "border-[1.5px] border-solid",
                      isHeld ? "border-nevo-violet" : "border-transparent",
                    )}
                  >
                    {!isEditing && !locked && (
                      <button
                        type="button"
                        onClick={() => onHold(item.segmentId)}
                        aria-pressed={isHeld}
                        aria-label={isHeld ? `Unflag the caption for ${label}` : `Flag the caption for ${label}`}
                        className={cn(
                          "absolute top-[7px] right-[7px] inline-flex size-[27px] cursor-pointer items-center justify-center rounded-full border-none shadow-[0_1px_4px_rgba(0,0,0,0.2)] transition-opacity duration-150 focus-visible:opacity-100 motion-reduce:opacity-100 [@media(hover:none)]:opacity-100",
                          isHeld
                            ? "bg-nevo-violet text-nevo-cream opacity-100"
                            : "bg-nevo-cream text-nevo-navy opacity-0 group-hover:opacity-100",
                        )}
                      >
                        <FlagIcon />
                      </button>
                    )}
                    {isHeld && (
                      <span className="absolute bottom-[7px] left-[7px] rounded-full bg-nevo-violet/32 px-[9px] py-0.5 text-[10px] font-semibold text-nevo-navy">
                        Flagged
                      </span>
                    )}
                  </MediaTile>
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center rounded-[10px] bg-nevo-cream-inset px-3 text-center text-[12px] leading-[1.4] text-nevo-near-black/55">
                    No preview of this picture.
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-[12px] text-nevo-near-black/60">{label}</span>
                {isEditing ? (
                  <>
                    <label htmlFor={`caption-${item.segmentId}`} className="sr-only">
                      {`Your caption for ${label}`}
                    </label>
                    <textarea
                      id={`caption-${item.segmentId}`}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      maxLength={CAPTION_MAX}
                      rows={3}
                      className="mt-1.5 w-full resize-y rounded-[8px] border-[1.5px] border-nevo-near-black/14 bg-nevo-cream px-3 py-2 text-[14px] leading-[1.5] text-nevo-near-black outline-none focus:border-nevo-navy"
                    />
                    <span className={cn(NOTE, "mt-1 block")}>
                      {length < CAPTION_MIN
                        ? `At least ${CAPTION_MIN} characters.`
                        : `${length} of ${CAPTION_MAX} characters.`}
                    </span>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        disabled={length < CAPTION_MIN || isSaving || locked}
                        onClick={() => {
                          void onSave(item.segmentId, draft).then((ok) => {
                            if (ok) setEditing(null);
                          });
                        }}
                        className="h-9 cursor-pointer rounded-[8px] border-none bg-nevo-navy px-3.5 text-[13px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93 disabled:cursor-default disabled:opacity-55"
                      >
                        {isSaving ? "Saving…" : "Save caption"}
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => setEditing(null)}
                        className="cursor-pointer border-none bg-transparent p-0 text-[13px] font-semibold text-nevo-near-black/60 hover:text-nevo-navy disabled:cursor-default"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-[14px] leading-[1.5] text-nevo-near-black">{item.caption}</p>
                    {!locked && saving === null && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(item.segmentId);
                          setDraft(item.caption);
                        }}
                        className="mt-2 cursor-pointer border-none bg-transparent p-0 text-[12.5px] font-semibold text-nevo-navy underline underline-offset-[3px]"
                      >
                        Write your own
                      </button>
                    )}
                  </>
                )}
                {said && (
                  <span role="alert" className="mt-2 block text-[12.5px] font-medium text-nevo-navy">
                    {said}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
