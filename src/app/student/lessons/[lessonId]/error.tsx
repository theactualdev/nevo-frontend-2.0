"use client";

// Route-level error boundary (Next.js file convention). Must be a Client
// Component. Next.js 16 renamed the reset prop to `unstable_retry` — it
// re-renders the segment (re-running the server component) to recover.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LessonError } from "@/components/student/Lesson/LessonError";
import { reportClientError } from "@/lib/api/clientErrors";

export default function LessonRouteError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
    // The screen says "We're on it"; this is what makes it so (B36).
    reportClientError(error, "student");
  }, [error]);

  return (
    <LessonError
      onRetry={() => unstable_retry()}
      onGoBack={() => router.push("/student/lessons")}
    />
  );
}
