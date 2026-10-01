import { api } from "./client";

/**
 * The authenticated user, whatever their role.
 *
 * `GET /api/v1/users/me` is the profile endpoint this console went without:
 * the session payload carries a `userId` and a role and nothing else, so
 * every screen wanting a name either invented one or showed none. This
 * returns name, email, school and subjects in a single call, for teachers and
 * admins alike.
 *
 * snake_case, like the rest of the deployed contract.
 */

export interface SchoolSummary {
  id: string;
  name: string;
  slug: string;
  code: string;
}

export interface CurrentUser {
  userId: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  /** Required by the contract - the backend always sends something renderable. */
  displayName: string;
  email: string | null;
  school: SchoolSummary | null;
  /** Optional in the contract, so absent rather than empty is possible. */
  subjects?: string[];
  /**
   * The teacher's own photo, when they have set one.
   *
   * REQUIRED ON `CurrentUserResponse` AND MISSING FROM THIS TYPE until
   * 18 Sep - the fourth time a delivered field was dropped because the client
   * type did not name it (after `note` on `Assignment`, `completedCount` on
   * the activity row, and `failedPages`, which is still open). Nothing could
   * render a photo because nothing could see one.
   */
  profileImageUrl?: string | null;
  /**
   * The look a student chose on Profile ("Choose your look"), or null. A free
   * string up to 40 characters; the ids are ours (`lib/profile/avatarTone`).
   */
  avatarTone?: string | null;
}

/** 201 of `POST /api/v1/users/me/profile-photo`. */
export interface ProfilePhoto {
  profileImageUrl: string;
}

export const usersApi = {
  /** The signed-in user's own profile. GET /api/v1/users/me */
  me: () => api.get<CurrentUser>("/api/v1/users/me"),

  /**
   * Update the teacher's own name and subjects. Shipped 1 Sep; before it,
   * `users/me` was GET-only and C11's Edit had nowhere to save to.
   *
   * MIND THE CASING, but not as previously recorded here. This said that
   * sending `firstName` was a silent no-op; it is not. `ProfilePatch` sets
   * `populate_by_name=True`, so the request accepts BOTH spellings and a
   * client sending snake_case round-trips correctly - confirmed against the
   * deployed API by backend, 2 Sep 2026.
   *
   * What is real is the asymmetry on the way back: the response has no alias
   * generator, so this endpoint returns the snake_case `CurrentUser`
   * (`userId`, `firstName`) while the rest of the product API is camelCase.
   * The auth surface keeps snake for backward compatibility and this endpoint
   * sits on it. Send camelCase to match the rest of the client; expect snake
   * coming back.
   *
   * `email` is deliberately not writable: it is an authentication identifier
   * and needs a verification flow rather than a silent change.
   *
   * `subjects` REPLACES the explicitly chosen list, but subjects inferred
   * from a teacher's lessons are merged back into the response - so what you
   * read back can legitimately be a superset of what you sent. That is not a
   * failed write, and nothing may treat it as one.
   */
  updateMe: (payload: {
    firstName?: string | null;
    lastName?: string | null;
    subjects?: string[] | null;
    avatarTone?: string | null;
  }) => api.patch<CurrentUser>("/api/v1/users/me", payload),

  /**
   * Replace the signed-in user's photo. Multipart, one field named `file`,
   * exactly like `contentApi.upload`.
   *
   * NO CLIENT-SIDE SIZE OR TYPE LIMIT, deliberately. The contract states
   * none - `Body_authentication_upload_profile_photo` is one required file
   * and nothing else - so a limit invented here would reject files the server
   * would have taken, and would be wrong the day the server changes its mind.
   * The picker asks for an image; the server's answer is the answer.
   */
  uploadProfilePhoto: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<ProfilePhoto>("/api/v1/users/me/profile-photo", form);
  },
};
