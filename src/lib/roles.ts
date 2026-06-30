export type Role =
  | "president"
  | "vice_president"
  | "general_secretary"
  | "assistant_general_secretary"
  | "financial_secretary"
  | "treasurer"
  | "evangelism_coordinator"
  | "male_organizer"
  | "female_organizer"
  | "member"
  | "pending";

export const ROLE_LABELS: Record<Role, string> = {
  president: "President",
  vice_president: "Vice President",
  general_secretary: "General Secretary",
  assistant_general_secretary: "Assistant General Secretary",
  financial_secretary: "Financial Secretary",
  treasurer: "Treasurer",
  evangelism_coordinator: "Evangelism Coordinator",
  male_organizer: "Male Organizer",
  female_organizer: "Female Organizer",
  member: "Member",
  pending: "Pending Approval",
};

export const ROLE_COLORS: Record<Role, string> = {
  president: "bg-purple-100 text-purple-800",
  vice_president: "bg-violet-100 text-violet-800",
  general_secretary: "bg-indigo-100 text-indigo-800",
  assistant_general_secretary: "bg-sky-100 text-sky-800",
  financial_secretary: "bg-green-100 text-green-800",
  treasurer: "bg-emerald-100 text-emerald-800",
  evangelism_coordinator: "bg-blue-100 text-blue-800",
  male_organizer: "bg-orange-100 text-orange-800",
  female_organizer: "bg-pink-100 text-pink-800",
  member: "bg-gray-100 text-gray-800",
  pending: "bg-yellow-100 text-yellow-800",
};

// Roles that can only be held by ONE person at a time. "member" is excluded — many people can be members.
export const SINGLETON_ROLES: Role[] = [
  "president",
  "vice_president",
  "general_secretary",
  "assistant_general_secretary",
  "financial_secretary",
  "treasurer",
  "evangelism_coordinator",
  "male_organizer",
  "female_organizer",
];

const isPresident = (role: Role) => ["president", "vice_president"].includes(role);

export const can = {
  manageMembers: (role: Role) => isPresident(role),
  sendBroadcast: (role: Role) =>
    ["president", "vice_president", "general_secretary", "assistant_general_secretary"].includes(role),
  viewFinance: (role: Role) =>
    ["president", "vice_president", "financial_secretary", "treasurer"].includes(role),
  editFinance: (role: Role) =>
    ["financial_secretary", "treasurer"].includes(role),
  publishFinancialStatement: (role: Role) =>
    ["financial_secretary", "treasurer"].includes(role),
  // Only President and General Secretary can publish reports directly.
  publishReport: (role: Role) =>
    ["president", "general_secretary"].includes(role),
  // Vice President and Assistant General Secretary can draft/submit reports (text or PDF),
  // but they need President/General Secretary approval before publishing.
  draftReport: (role: Role) =>
    ["president", "general_secretary", "vice_president", "assistant_general_secretary"].includes(role),
  approveReport: (role: Role) =>
    ["president", "general_secretary"].includes(role),
  scheduleMeeting: (role: Role) =>
    ["president", "vice_president", "male_organizer", "female_organizer"].includes(role),
  markAttendance: (role: Role) =>
    ["president", "vice_president", "male_organizer", "female_organizer"].includes(role),
  // Evangelism Coordinator is an executive title only — no special bible-quote privileges beyond a member.
  sendBibleQuote: (role: Role) =>
    ["president", "vice_president"].includes(role),
  checkAbsentMembers: (role: Role) =>
    ["president", "vice_president", "male_organizer", "female_organizer"].includes(role),
  accessAdmin: (role: Role) => isPresident(role),
  // Only the President can see members' dates of birth.
  viewDateOfBirth: (role: Role) => role === "president",
};
