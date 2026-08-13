// Deep links to ASSIST.org's own public "transferability list" pages, per
// college -- these are plain shareable URLs on ASSIST's site (confirmed by
// clicking through their UI), not a scrape of any ASSIST data. ASSIST's own
// statement on data requests (assist.org, March 2025) says third-party API/
// bulk-data access isn't licensed until 2026-2027, so this project does not
// pull articulation data itself -- it only links out, same pattern as the
// RateMyProfessor links.
import type { CollegeCode } from "./types";

const ASSIST_INSTITUTION_IDS: Record<CollegeCode, number> = {
  GW: 55,
  OC: 74,
  CL: 105,
};
const ASSIST_YEAR_ID = 77; // 2026-2027 academic year -- update yearly

export function assistTransferabilityUrl(college: string): string | null {
  if (!(college in ASSIST_INSTITUTION_IDS)) return null;
  const collegeCode = college as CollegeCode;
  const institution = ASSIST_INSTITUTION_IDS[collegeCode];
  return `https://assist.org/transfer/results?year=${ASSIST_YEAR_ID}&institution=${institution}&type=CSUTC&view=transferability`;
}
