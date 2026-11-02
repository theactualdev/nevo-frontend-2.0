# Deploy order

**The rule (Lydia, 31 Oct 2026):** a stricter backend check never goes live
before the client sends the format it demands.

This is a rule, not a request. It binds every backend deploy that tightens what
the API accepts: a new required field, a narrower enum, a stricter validator.

## Why

On 29 Oct 2026 a stricter check on the senior secondary onboarding baseline went
live while the app still sent Word Conflict in the old format. From late morning
until about 7pm, every senior secondary pupil's onboarding baseline was refused.
The app's fix went live at 6:50pm, and the backend then accepted both formats
(backend 3888e72).

## The order

1. The backend says which format the new check will demand.
2. The frontend ships that format, and its production deploy succeeds.
3. Only then does the backend turn the stricter check on. Until then it accepts
   the old shape and the new one.

Two things to know:

- **"What the client sends" includes work saved on a device before the update.**
  On 29 Oct, refused baseline runs were kept on each child's device and resent
  later, still in the old shape.
- **CI's contract check is not a guard for this.** It reads the deployed spec,
  so it only notices a stricter check after it is already live.
