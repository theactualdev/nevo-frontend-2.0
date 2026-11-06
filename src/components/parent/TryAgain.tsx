"use client";

/**
 * THE CONTROL A PARENT'S FAILED READ WAS MISSING (backlog 54, 57, 59, 60).
 * Five parent screens said "try again in a moment" and gave the parent
 * nothing to press, so the only way to try again was knowing to reload the
 * page. This asks again in place. Asking changes nothing on the server - every
 * one of these is a read.
 */
export function TryAgain({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-4 cursor-pointer text-[14.5px] font-semibold text-nevo-navy hover:underline"
    >
      Try again
    </button>
  );
}
