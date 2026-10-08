"use client";

import { useEffect, useRef, useState } from "react";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { AvatarDisc } from "@/components/shared/AvatarDisc";
import type { TeacherProfile } from "@/lib/mocks/teacherProfile";

/**
 * C11 Edit profile. Name and subjects are the teacher's to change; the email
 * is school-managed and shown read-only rather than as a disabled input, so
 * it reads as "not yours to edit" instead of "broken".
 *
 * "CHANGE PHOTO" WAS THE ONE DEAD CONTROL in the whole profile menu - a
 * button with no `onClick`, carrying `TODO(api): photo upload - the frame
 * draws the affordance only`. `POST /api/v1/users/me/profile-photo` has been
 * deployed all along and `profileImageUrl` is required on `users/me`; the
 * client type simply never named the field, so nothing could render a photo
 * and nothing could send one.
 *
 * THE UPLOAD IS THE PARENT'S, like the save. This owns the picker and what a
 * teacher sees while it runs; the screen above owns the write and whether
 * there is a live session to write with. No handler means no control, rather
 * than a button that opens a picker and drops the file.
 */
export function EditProfileModal({
  profile,
  photoUrl,
  onCancel,
  onSave,
  onPhotoPicked,
}: {
  profile: TeacherProfile;
  /** The photo already on the account, if any. */
  photoUrl?: string | null;
  onCancel: () => void;
  /** Resolves true once the write has actually landed. */
  onSave: (next: TeacherProfile) => Promise<boolean> | boolean;
  /** Uploads the file and resolves the new URL, or null if it did not land. */
  onPhotoPicked?: (file: File) => Promise<string | null>;
}) {
  const [name, setName] = useState(profile.name);
  const [subjects, setSubjects] = useState(profile.subjects);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(photoUrl ?? null);
  const [photoState, setPhotoState] = useState<"idle" | "sending" | "failed">(
    "idle",
  );

  const pickPhoto = async (file: File | undefined) => {
    if (!file || !onPhotoPicked || photoState === "sending") return;
    setPhotoState("sending");
    const url = await onPhotoPicked(file);
    setPhotoState(url ? "idle" : "failed");
    if (url) setPhoto(url);
  };

  /**
   * Nothing closes until the write lands. The modal used to call `onSave` and
   * dismiss in the same breath, which would have reported a saved profile
   * over a failed PATCH the moment there was a PATCH to fail.
   */
  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setFailed(false);
    const ok = await onSave({
      ...profile,
      name: name.trim(),
      subjects: subjects.trim(),
    });
    setSaving(false);
    if (!ok) setFailed(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const field =
    "mt-1.5 h-12 w-full rounded-[10px] border border-nevo-near-black/14 bg-nevo-cream-elevated px-3.5 text-[15px] text-nevo-near-black outline-none transition-colors focus:border-nevo-navy";
  const label =
    "text-xs font-semibold tracking-[0.03em] text-nevo-near-black/55 uppercase";

  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-nevo-near-black/50 p-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Edit profile"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] rounded-[16px] bg-nevo-cream px-[30px] py-7 shadow-[0_24px_60px_rgba(0,0,0,0.3)] motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-200"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-nevo-near-black">
            Edit profile
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="flex cursor-pointer text-nevo-near-black/40 transition-colors hover:text-nevo-near-black/70"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="mt-[22px] flex items-center gap-4">
          <AvatarDisc photoUrl={photo} className="size-[60px] text-xl font-semibold">
            {profile.initials}
          </AvatarDisc>
          {onPhotoPicked && (
            <>
              {/* The button is the control; the input is how the browser
                  opens a picker. Hidden rather than styled, because a styled
                  file input is a different control on every platform. */}
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="hidden"
                aria-hidden
                tabIndex={-1}
                onChange={(e) => {
                  void pickPhoto(e.target.files?.[0]);
                  /*
                   * So picking the same file twice still fires a change. A
                   * teacher who uploads a photo, crops it and picks the same
                   * filename again gets no event at all without this.
                   *
                   * NOT COVERED, AND IT CANNOT BE: jsdom never sets `value`
                   * from a `change` event carrying files, and refuses to let a
                   * test set it - so removing this line fails nothing. A
                   * mutation run proved that rather than a reviewer noticing.
                   */
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={photoState === "sending"}
                className="inline-flex h-[38px] cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/35 px-[15px] text-[13.5px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6 disabled:cursor-default disabled:opacity-55"
              >
                {photoState === "sending" ? "Sending…" : "Change photo"}
              </button>
            </>
          )}
        </div>

        {photoState === "failed" && (
          <p className="mt-3 text-[13px] leading-[1.5] text-nevo-near-black/70">
            That photo didn&rsquo;t upload, so your old one is still there. You
            can try again, or pick a different file.
          </p>
        )}

        <div className="mt-5 flex flex-col gap-4">
          <label className="block">
            <span className={label}>Full name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={field}
            />
          </label>
          <label className="block">
            <span className={label}>Subjects</span>
            <input
              value={subjects}
              onChange={(e) => setSubjects(e.target.value)}
              className={field}
            />
          </label>
          {failed && (
            <p className="rounded-[10px] bg-nevo-violet/14 px-3.5 py-3 text-[13px] leading-[1.5] text-nevo-near-black/78">
              We couldn&rsquo;t save that just now. Nothing has changed, and
              your edits are still here, so you can try again.
            </p>
          )}

          <div>
            <span className={label}>Email</span>
            <div className="mt-1.5 flex h-12 items-center justify-between gap-3 rounded-[10px] border border-nevo-near-black/10 bg-nevo-near-black/5 px-3.5 text-[15px] text-nevo-near-black/55">
              <span className="min-w-0 truncate">{profile.email}</span>
              <span className="shrink-0 text-xs whitespace-nowrap text-nevo-near-black/40">
                Managed by your school
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() =>
              void submit()
            }
            className="h-12 flex-1 cursor-pointer rounded-[10px] bg-nevo-navy text-[15px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93"
          >
            {saving ? "Saving…" : failed ? "Try again" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-12 shrink-0 cursor-pointer rounded-[10px] px-[22px] text-sm font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
