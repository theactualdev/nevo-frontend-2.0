"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { INQUIRY_ROLES, partnerInquiriesApi, type InquiryRoleLabel } from "@/lib/api";

/**
 * The single conversion path (SCRUM-43): every CTA on the page scrolls here.
 * Submitting posts a partner inquiry to the live backend (SCRUM-82,
 * `POST /api/v1/partner-inquiries`) - it never creates an account.
 *
 * THANK YOU ONLY ONCE IT IS SAVED (Jira audit, 26 Oct). This used to complete
 * optimistically - the POST fired and forgotten, "Thank you. We will be in
 * touch soon." shown at once - so a POST that failed lost the conversation
 * silently while promising a reply. On 24 Oct the backend was suspended for
 * hours, and anyone who wrote in then was thanked and never heard from. The
 * reason given, a free-tier cold start of tens of seconds, goes with the paid
 * plan. Now the button says it is sending, success waits for the save, and a
 * failure keeps the form - and everything typed into it - with one calm line.
 */

const fieldLabel: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#2b2b2f",
  marginBottom: 6,
};

const fieldBase: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  height: 52,
  background: "#ede8dc",
  border: "1px solid transparent",
  borderRadius: 10,
  fontFamily: "inherit",
  fontSize: 15,
  color: "#2b2b2f",
  padding: "0 16px",
  outline: "none",
  transition: "border-color 150ms ease, background 150ms ease",
};

const ROLES = Object.keys(INQUIRY_ROLES) as InquiryRoleLabel[];

/** Decorative dotted connection paths flanking the form card. */
function ConnectionPaths({ flipped }: { flipped?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      style={{
        position: "absolute",
        zIndex: 0,
        ...(flipped ? { right: 0 } : { left: 0 }),
        top: "50%",
        transform: flipped ? "translateY(-50%) scaleX(-1)" : "translateY(-50%)",
        width: "clamp(120px,21vw,300px)",
        height: 320,
        pointerEvents: "none",
      }}
      viewBox="0 0 300 320"
      fill="none"
      preserveAspectRatio="none"
    >
      <path
        d="M4 72 C180 104 128 214 296 188"
        stroke="rgba(154,156,203,0.55)"
        strokeWidth="1.6"
        strokeDasharray="1 9"
        strokeLinecap="round"
      />
      <path
        d="M4 168 C150 168 158 132 296 160"
        stroke="rgba(154,156,203,0.38)"
        strokeWidth="1.6"
        strokeDasharray="1 9"
        strokeLinecap="round"
      />
      <circle cx="296" cy="188" r="4" fill="#9a9ccb" />
      <circle cx="296" cy="160" r="3.4" fill="rgba(154,156,203,0.75)" />
    </svg>
  );
}

/** Ours, not design's - in Lydia's copy list for her pass. */
const DID_NOT_SEND =
  "That didn't send. Everything you wrote is still here, so please try again in a moment.";

export function ConversationSection() {
  const [phase, setPhase] = useState<"form" | "sending" | "fading" | "success">("form");
  const [failed, setFailed] = useState(false);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (phase !== "form") return;
    const data = new FormData(e.currentTarget);
    const roleLabel = String(data.get("role") ?? "") as InquiryRoleLabel;
    const inquiry = {
      fullName: String(data.get("name") ?? ""),
      schoolName: String(data.get("school") ?? ""),
      role: INQUIRY_ROLES[roleLabel] ?? "other",
      contact: String(data.get("contact") ?? ""),
      message: String(data.get("message") ?? "") || undefined,
    };
    setFailed(false);
    setPhase("sending");
    partnerInquiriesApi
      .submit(inquiry)
      .then(() => {
        setPhase("fading");
        setTimeout(() => setPhase("success"), 300);
      })
      .catch(() => {
        // The form never unmounted, so every field still holds what was typed.
        setFailed(true);
        setPhase("form");
      });
  };

  const fading: CSSProperties = {
    transition: "opacity 300ms ease",
    opacity: phase === "fading" ? 0 : 1,
  };

  return (
    <section
      id="nv-form-sec"
      style={{
        position: "relative",
        overflow: "hidden",
        background: "#f7f1e6",
        padding: "clamp(80px,12vh,130px) 24px",
        boxSizing: "border-box",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          zIndex: 0,
          pointerEvents: "none",
          width: 480,
          height: 480,
          borderRadius: 999,
          background: "rgba(154,156,203,0.14)",
          filter: "blur(90px)",
          top: -120,
          right: -100,
          animation: "nvFloat 15s ease-in-out infinite",
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          zIndex: 0,
          pointerEvents: "none",
          width: 360,
          height: 360,
          borderRadius: 999,
          background: "rgba(237,232,220,0.8)",
          filter: "blur(70px)",
          bottom: -140,
          left: -80,
          animation: "nvFloat2 18s ease-in-out infinite",
        }}
      />
      <ConnectionPaths />
      <ConnectionPaths flipped />
      <div
        data-reveal="scroll"
        data-dy="48"
        data-dur="720"
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 544,
          margin: "0 auto",
          background: "#f7f1e6",
          border: "1px solid rgba(59,63,110,0.08)",
          borderRadius: 20,
          padding: "clamp(26px,4vw,40px)",
          boxShadow: "0 18px 52px rgba(43,43,47,0.10)",
          boxSizing: "border-box",
        }}
      >
        {phase !== "success" && (
          <>
            <div id="nv-form-intro" style={fading}>
              <div
                data-reveal="scroll"
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "flex-end",
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                <span
                  style={{
                    width: 44,
                    height: 32,
                    borderRadius: "16px 16px 16px 4px",
                    background: "#3b3f6e",
                  }}
                />
                <span
                  style={{
                    width: 58,
                    height: 32,
                    borderRadius: "16px 16px 4px 16px",
                    background: "rgba(154,156,203,0.32)",
                  }}
                />
              </div>
              <div
                data-reveal="scroll"
                data-delay="60"
                style={{
                  textAlign: "center",
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "2.5px",
                  textTransform: "uppercase",
                  color: "#9a9ccb",
                }}
              >
                The conversation
              </div>
              <h2
                data-reveal="scroll"
                data-delay="80"
                style={{
                  margin: "12px 0 0",
                  textAlign: "center",
                  fontWeight: 600,
                  letterSpacing: "-0.025em",
                  fontSize: "clamp(28px,4vw,42px)",
                  color: "#2b2b2f",
                }}
              >
                Start the conversation.
              </h2>
              <p
                data-reveal="scroll"
                data-delay="160"
                style={{
                  margin: "10px 0 0",
                  textAlign: "center",
                  fontSize: 16,
                  lineHeight: 1.6,
                  color: "rgba(43,43,47,0.7)",
                }}
              >
                Tell us about your school. We will reach out personally.
              </p>
            </div>

            <form
              id="nv-form"
              onSubmit={onSubmit}
              style={{
                marginTop: 26,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                ...fading,
              }}
            >
              <label
                data-reveal="scroll"
                data-delay="0"
                data-dy="12"
                data-dur="400"
                style={{ display: "block" }}
              >
                <span style={fieldLabel}>Your name</span>
                <input
                  className="nv-field"
                  type="text"
                  name="name"
                  required
                  placeholder="Full name"
                  style={fieldBase}
                />
              </label>
              <label
                data-reveal="scroll"
                data-delay="80"
                data-dy="12"
                data-dur="400"
                style={{ display: "block" }}
              >
                <span style={fieldLabel}>School name</span>
                <input
                  className="nv-field"
                  type="text"
                  name="school"
                  required
                  placeholder="Your school's name"
                  style={fieldBase}
                />
              </label>
              <label
                data-reveal="scroll"
                data-delay="160"
                data-dy="12"
                data-dur="400"
                style={{ display: "block" }}
              >
                <span style={fieldLabel}>Your role</span>
                <span style={{ position: "relative", display: "block" }}>
                  <select
                    className="nv-field"
                    name="role"
                    defaultValue=""
                    style={{
                      ...fieldBase,
                      padding: "0 40px 0 16px",
                      cursor: "pointer",
                    }}
                  >
                    <option value="" disabled>
                      Select your role
                    </option>
                    {ROLES.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                  <span
                    style={{
                      position: "absolute",
                      right: 16,
                      top: "50%",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                      color: "#3b3f6e",
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </span>
                </span>
              </label>
              <label
                data-reveal="scroll"
                data-delay="240"
                data-dy="12"
                data-dur="400"
                style={{ display: "block" }}
              >
                <span style={fieldLabel}>Email or phone</span>
                <input
                  className="nv-field"
                  type="text"
                  name="contact"
                  required
                  placeholder="How should we reach you?"
                  style={fieldBase}
                />
              </label>
              <label
                data-reveal="scroll"
                data-delay="320"
                data-dy="12"
                data-dur="400"
                style={{ display: "block" }}
              >
                <span style={fieldLabel}>
                  What made you curious about Nevo?
                </span>
                <textarea
                  className="nv-field"
                  name="message"
                  placeholder="Optional, but we would love to know"
                  style={{
                    ...fieldBase,
                    height: "auto",
                    minHeight: 100,
                    padding: "14px 16px",
                    resize: "vertical",
                  }}
                />
              </label>
              <button
                type="submit"
                data-reveal="scroll"
                data-delay="400"
                data-dy="12"
                data-dur="400"
                className="nv-bright"
                style={{
                  marginTop: 6,
                  border: "none",
                  height: 54,
                  borderRadius: 10,
                  background: "#3b3f6e",
                  color: "#f7f1e6",
                  fontFamily: "inherit",
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "filter 150ms ease",
                }}
                aria-busy={phase === "sending"}
              >
                {phase === "sending" ? "Sending…" : "Request an introduction"}
              </button>
              {failed && (
                <p
                  role="alert"
                  style={{ margin: "2px 0 0", fontSize: 14, lineHeight: 1.5, color: "#3b3f6e" }}
                >
                  {DID_NOT_SEND}
                </p>
              )}
            </form>
          </>
        )}

        {phase === "success" && (
          <div
            id="nv-success"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              padding: "48px 0",
              animation: "nvFadeUp 400ms cubic-bezier(0.16,1,0.3,1) both",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 52,
                height: 52,
                borderRadius: 999,
                background: "#3b3f6e",
                color: "#f7f1e6",
              }}
            >
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <div
              style={{
                marginTop: 20,
                fontWeight: 600,
                fontSize: 21,
                color: "#2b2b2f",
              }}
            >
              Thank you. We will be in touch soon.
            </div>
            <div style={{ marginTop: 6, fontSize: 15, color: "#9a9ccb" }}>
              Someone from Nevo will reach out within 24 hours.
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
