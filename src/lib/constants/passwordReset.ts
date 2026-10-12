/**
 * How long a password-reset link lasts, in minutes. The contract's own value
 * (`ResetReceipt.expiresInMinutes`, `const: 60`), for the screen a link lands
 * on once it has expired - where there is no receipt to read it from. C02d's
 * frame says 30; backend set it to 60 on 12 Oct.
 */
export const RESET_LINK_MINUTES = 60;
