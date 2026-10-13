import { NotFoundScreen } from "@/components/shared/SystemScreens";

/**
 * A missing record INSIDE the console stays inside it.
 *
 * Without this, `notFound()` from a class, lesson or student route fell
 * through to the root page: no rail, no way back into the console but a
 * button. Next renders a segment's own not-found inside its layout, so the
 * teacher keeps the shell around the same calm screen.
 */
export default function TeacherNotFound() {
  return <NotFoundScreen inShell />;
}
