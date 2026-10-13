/**
 * The teacher's sign-in pages - the door, activation, reset, the school
 * sign-in return, session expired.
 *
 * Marked as the teacher console's so the page under them is cream, never the
 * component library's white (design's reference, 12 Oct; globals.css). The
 * shared auth layout above stays as it is for every role.
 */
export default function TeacherAuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div data-nevo-console="teacher" className="contents">
      {children}
    </div>
  );
}
