import type { MetadataRoute } from "next";
import { SITE_NAME } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nevo - adaptive learning",
    short_name: SITE_NAME,
    description: "Adaptive learning, in every child's own language.",
    /*
     * THE INSTALLED APP OPENS ON THE STUDENT APP, not the marketing page. It
     * was "/", whose only sign-in goes to the admin door - so a tablet with
     * Nevo on its home screen never reached a child's sign-in or Home. IA 31:
     * "App opens, active session -> Student Home Dashboard; no session ->
     * Student Login Screen", which is exactly what `/student` does through
     * the route guard.
     */
    start_url: "/student",
    display: "standalone",
    background_color: "#f7f1e6",
    theme_color: "#f7f1e6",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
