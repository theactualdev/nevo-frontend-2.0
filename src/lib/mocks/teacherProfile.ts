/**
 * Teacher profile and settings (C11). The email is school-managed and read
 * only; everything else the teacher owns.
 *
 * Superseded for a signed-in teacher: identity comes from `GET /api/v1/users/me`
 * and the notification choices persist to `/api/settings/me`. The values below
 * back the designed screens, and DEFAULT_SETTINGS is still the real starting
 * position for an account that has never saved.
 */

export interface TeacherProfile {
  initials: string;
  name: string;
  subjects: string;
  school: string;
  email: string;
}

export const TEACHER_PROFILE: TeacherProfile = {
  initials: "MA",
  name: "Adunni Adeyemi",
  subjects: "Mathematics & English",
  school: "Brightgate Academy",
  email: "a.adeyemi@brightgate.edu.ng",
};

export interface SettingRow {
  id: string;
  label: string;
  sub: string;
}

export const NOTIFICATION_SETTINGS: SettingRow[] = [
  {
    id: "attention",
    label: "Something changed suddenly",
    sub: "A student's pattern shifts noticeably",
  },
  {
    id: "messages",
    label: "Messages from students",
    sub: "New replies in your threads",
  },
  {
    id: "reports",
    label: "Weekly summary",
    sub: "A calm Monday overview of each class",
  },
];

export const ACCESSIBILITY_SETTINGS: SettingRow[] = [
  {
    id: "reduceMotion",
    label: "Reduce motion",
    sub: "Calm the small animations across Nevo",
  },
  {
    id: "largerText",
    label: "Larger text",
    sub: "Increase text size across the console",
  },
];

/** Frame defaults, verbatim. */
export const DEFAULT_SETTINGS: Record<string, boolean> = {
  attention: true,
  messages: true,
  reports: false,
  reduceMotion: true,
  largerText: false,
};
