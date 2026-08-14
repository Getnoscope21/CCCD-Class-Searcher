// General Education requirement categories, sourced from CCCD's own search
// form (the "Attributes" dropdown on pw_pub_sched.p_search). We only surface
// the unified CALGETC/IGETC codes here (not the ~40 CSU-specific sub-areas
// or the military program codes also present in that dropdown) to keep this
// short and legible, similar in spirit to Berkeleytime's Requirements filter.
import type { RequirementCategory } from "./types";

export const REQUIREMENT_CATEGORIES: readonly RequirementCategory[] = [
  {
    key: "english-comp",
    label: "English Composition (Entry-Level Writing)",
    codes: ["1A"],
  },
  { key: "critical-thinking", label: "Critical Thinking", codes: ["1B"] },
  { key: "oral-comm", label: "Oral Communication", codes: ["1C", "1CCG"] },
  { key: "math-concepts", label: "Math Concepts", codes: ["2A"] },
  { key: "arts", label: "Arts", codes: ["3A"] },
  { key: "humanities", label: "Humanities", codes: ["3B"] },
  {
    key: "social-behavioral",
    label: "Social & Behavioral Sciences",
    codes: ["4"],
  },
  { key: "physical-science", label: "Physical Science", codes: ["5A"] },
  { key: "biological-science", label: "Biological Science", codes: ["5B"] },
  { key: "ethnic-studies", label: "Ethnic Studies", codes: ["7"] },
  {
    key: "language-other-than-english",
    label: "Language Other Than English",
    codes: ["6A"],
  },
];

export const ALL_GE_CODES = [
  ...new Set(REQUIREMENT_CATEGORIES.flatMap((category) => category.codes)),
];
