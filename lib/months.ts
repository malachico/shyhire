/** A stored experience date as a native month input value (YYYY-MM), or '' when it is free text like "2020" or "Present". */
export const monthValue = (v: string): string => (/^\d{4}-(0[1-9]|1[0-2])$/.test(v.trim()) ? v.trim() : '');

/** Free text the month input can't show, such as an older "2019" or "Jan 2019". "Present"/"Current" are not legacy: empty means the same. */
export const legacyDate = (v: string): string => (v.trim() && !monthValue(v) && !/^(present|current)$/i.test(v.trim()) ? v.trim() : '');
