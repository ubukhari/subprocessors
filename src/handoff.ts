/**
 * The hand-off, worded as not built (brief DOOR-18). A hosted list fits agentcheck's services, but
 * it needs a database migration and a brief of its own, so it is a waitlist first: every run and
 * every page ends with the same sentence and a link to the /subprocessors waitlist button, whose
 * click is the count. No price is named until one is decided and its checkout works.
 */

/** The pages, and where a run's links land. */
export const PAGES_URL = "https://agentwares-agentcheck.vercel.app/subprocessors";

/** The `?ref=` value the pages record for links this CLI prints. */
export const REF = "subprocessors";

/** Where a run's hand-off line points: the index's ledger section. */
export const HANDOFF_URL = `${PAGES_URL}?ref=${REF}#ledger`;

/** The hand-off, word for word, at the end of every run and in the ledger section of every page. */
export const HANDOFF_LINE =
  "A hosted, dated sub-processor page that emails your customers each change is not built.";

/** What it would do, and what agentcheck serves today. */
export const HANDOFF_DETAIL =
  "It would publish the list you approved at a public URL, keep every change with its date, " +
  "email your subscribers the notice with the day their objection window closes, and record who " +
  "was told when. agentcheck runs scheduled checks of endpoints today; this is not one of them. " +
  "If you would pay for it, say so with one click:";
