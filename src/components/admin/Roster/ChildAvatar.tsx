"use client";

import { useEffect, useState } from "react";
import { StudentAvatar } from "@/components/shared/StudentAvatar";
import { classesApi } from "@/lib/api/classes";
import type { AvatarLook } from "@/lib/profile/avatarLook";
import { lookOfChild } from "@/lib/profile/rosterLook";

/**
 * A CHILD'S AVATAR ON AN ADMIN SCREEN (SCRUM-324; Lydia's 928cf30 build
 * list): their shape in their tone, from the one `StudentAvatar` - never their
 * initials. Staff and parents keep initials, deliberately. The name always
 * sits beside it, so the tile stays silent to a screen reader.
 *
 * `look` null means the screen hasn't been told the child's look yet (still
 * reading, or no read carries it): a plain tile that claims no look at all,
 * rather than the nothing-chosen navy circle, which would say the child has
 * chosen nothing.
 */
export function ChildAvatar({ look, size }: { look: AvatarLook | null; size: number }) {
  if (!look) {
    return (
      <span
        aria-hidden
        data-avatar-look="unknown"
        className="flex-none rounded-full bg-nevo-near-black/[0.06]"
        style={{ width: size, height: size }}
      />
    );
  }
  return <StudentAvatar look={look} size={size} />;
}

/**
 * The look for one child on a record page. The single-student read carries no
 * avatar fields (raised), so it comes from the child's class roster, the read
 * that does. Null while reading, when the child is in no class, or when the
 * read fails - never a guessed look.
 */
export function useChildLook(studentId: string, classIds: readonly string[] | undefined): AvatarLook | null {
  const classId = classIds?.[0] ?? null;
  const [found, setFound] = useState<{ key: string; look: AvatarLook | null } | null>(null);
  const key = `${studentId}:${classId ?? ""}`;

  useEffect(() => {
    if (!classId) return;
    let live = true;
    classesApi
      .classStudents(classId)
      .then((rows) => {
        const mine = rows.find((r) => r.studentId === studentId);
        if (live) setFound({ key, look: mine ? lookOfChild(mine) : null });
      })
      .catch(() => {
        if (live) setFound({ key, look: null });
      });
    return () => {
      live = false;
    };
  }, [classId, studentId, key]);

  return found?.key === key ? found.look : null;
}
