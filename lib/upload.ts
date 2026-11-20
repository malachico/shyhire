/**
 * The largest CV PDF we read. The browser sends it base64 in JSON, which grows it by 4/3, and Vercel rejects request
 * bodies over 4.5 MB, so 3 MB of PDF (4 MiB on the wire) is the most that fits.
 */
export const MAX_PDF_BYTES = 3 * 1024 * 1024;
export const MAX_PDF_LABEL = `${MAX_PDF_BYTES / 1024 / 1024} MB`;
/** The draft route's body cap: a max-size PDF in base64 plus room for the JSON around it. */
export const MAX_DRAFT_BODY_BYTES = Math.ceil(MAX_PDF_BYTES / 3) * 4 + 100_000;
export const VERCEL_BODY_LIMIT_BYTES = 4.5 * 1000 * 1000;
