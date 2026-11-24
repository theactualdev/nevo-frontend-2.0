/**
 * A download as the server issues one since safety v2 (Teslim 9f4d763, 18
 * Nov): an id for its status check, and an expiry fourteen days on - here,
 * far enough on that no test passes it. A test keeping a copy the child can
 * open gives it this; a copy without it is one saved before safety v2, which
 * never opens offline (`canOpenOffline`).
 */
export const FRESH_DOWNLOAD = {
  downloadId: "download-test",
  expiresAt: "2099-01-01T00:00:00.000Z",
} as const;
