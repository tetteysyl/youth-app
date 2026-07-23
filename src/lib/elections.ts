import { Role } from "./roles";

/**
 * Elections.
 *
 * Every executive office is filled by election EXCEPT the Evangelism Coordinator,
 * which is appointed rather than voted for.
 */
export const ELECTABLE_POSITIONS: Role[] = [
  "president",
  "vice_president",
  "general_secretary",
  "assistant_general_secretary",
  "financial_secretary",
  "treasurer",
  "male_organizer",
  "female_organizer",
];

export type ElectionStatus = "draft" | "open" | "closed";

export const STATUS_LABELS: Record<ElectionStatus, string> = {
  draft: "Draft",
  open: "Voting open",
  closed: "Closed",
};

export type Candidate = {
  id: string;
  memberId: string;
  memberName: string;
  photoURL?: string | null;
  position: Role;
};

export type Election = {
  id: string;
  title: string;
  /** Dues year used to decide who may vote. */
  year: number;
  status: ElectionStatus;
  positions: Role[];
  createdByName?: string;
  createdAt?: number | null;
  openedAt?: number | null;
  closedAt?: number | null;
};

/** Voter eligibility: a member may not vote while owing dues for the election year. */
export type Eligibility = {
  eligible: boolean;
  unpaidMonths: number[];
  /** Months that were checked (elapsed months of the election year). */
  monthsChecked: number;
};

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Which months of `year` must already be paid.
 * For the current year that's the months elapsed so far; for a past year, all 12.
 * Nobody is penalised for months that have not happened yet.
 */
export function monthsRequiredFor(year: number, now = new Date()): number {
  if (year < now.getFullYear()) return 12;
  if (year > now.getFullYear()) return 0;
  return now.getMonth() + 1;
}
