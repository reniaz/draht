/**
 * Fields the mod adds to upstream types.
 *
 * Done by declaration merging rather than by editing `src/api/types/messages.ts`, so the
 * upstream diff stays at zero files for this. Works because `ApiMessage` is declared as
 * an `interface` (src/api/types/messages.ts:754) — if upstream ever converts it to a
 * `type` alias, this file stops working and the fields have to be appended upstream
 * instead.
 */
import '../../api/types/messages';

declare module '../../api/types/messages' {
  interface ApiMessage {
    /** Set when the mod intercepted a deletion and kept the message instead. */
    isModDeleted?: boolean;
    /** Epoch ms of the intercepted deletion. Drives log retention. */
    modDeletedAt?: number;
    /**
     * Superseded revisions, oldest first. Each entry pairs the content that was
     * *replaced* with the timestamp at which it was replaced, so the full revision list
     * is `[...modEditHistory.map((e) => e.text), currentText]`.
     */
    modEditHistory?: { date: number; text: string }[];
    /** Timestamp the oldest logged revision started being the content. */
    modFirstEditDate?: number;
  }
}
