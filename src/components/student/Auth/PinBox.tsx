import { cn } from "@/lib/utils";

/**
 * One PIN box, on every screen a child enters a PIN: PIN creation, Change PIN,
 * the PIN door and the shared device picker's PIN (28c), and the full sign-in
 * (00c). The held boxes of D154's pause are these boxes, empty.
 *
 * ONE FILLED TREATMENT, EVERYWHERE (D177, D199; 13 Oct). Lydia: "One box
 * component, one filled treatment, every screen it appears on ... A child who
 * learns what a filled box looks like on one screen should not have to
 * relearn it on another." Design's landed note draws it: a filled box is a
 * solid navy fill with a navy border and a cream dot, and an empty box has a
 * muted navy border. It was four copies - near-black dots on cream, a navy
 * border on some screens' filled boxes and not others'.
 *
 * NO ERROR COLOUR. A wrong PIN used to turn the empty boxes violet. D199: "A
 * filled box is a filled box whether the last attempt was wrong or not, and
 * the error is carried by the error line, not by recolouring the boxes." So
 * there is no `error` here to pass.
 *
 * The caret's box - the next one to fill - keeps a full navy border, as every
 * screen drew it. The size is the screen's (`className`, `dotClassName`), so a
 * row keeps its shape; the colours are not, so no screen can drift.
 *
 * WAITING ON FRAMES: the muted navy's exact strength. The note says "muted
 * navy" and gives no value; this is navy at 30%, design's own empty-dot border
 * (17c's reading dots: navy fill for done, a 1.5px navy-30% ring for not yet).
 */
export function PinBox({
  filled,
  caret = false,
  className,
  dotClassName = "size-3",
}: {
  filled: boolean;
  /** The box the next digit lands in. Never a filled one. */
  caret?: boolean;
  /** The screen's size, and anything else that is the screen's own. */
  className?: string;
  dotClassName?: string;
}) {
  return (
    <div
      data-pin-box={filled ? "filled" : caret ? "caret" : "empty"}
      className={cn(
        "flex items-center justify-center rounded-[10px] border-[1.5px] shadow-[0_2px_8px_rgba(0,0,0,0.05)]",
        filled
          ? "border-nevo-navy bg-nevo-navy"
          : caret
            ? "border-nevo-navy bg-nevo-cream"
            : "border-nevo-navy/30 bg-nevo-cream",
        className,
      )}
    >
      {filled && (
        <span className={cn("block rounded-full bg-nevo-cream", dotClassName)} />
      )}
    </div>
  );
}
