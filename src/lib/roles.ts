export type Role =
  | "president"
  | "vice_president"
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
  financial_secretary: "bg-green-100 text-green-800",
  treasurer: "bg-emerald-100 text-emerald-800",
  evangelism_coordinator: "bg-blue-100 text-blue-800",
  male_organizer: "bg-orange-100 text-orange-800",
  female_organizer: "bg-pink-100 text-pink-800",
  member: "bg-gray-100 text-gray-800",
  pending: "bg-yellow-100 text-yellow-800",
};

const isPresident = (role: Role) => ["president", "vice_president"].includes(role);

export const can = {
  manageMembers: (role: Role) => isPresident(role),
  sendBroadcast: (role: Role) => isPresident(role),
  viewFinance: (role: Role) =>
    ["president", "vice_president", "financial_secretary", "treasurer"].includes(role),
  editFinance: (role: Role) =>
    ["financial_secretary", "treasurer"].includes(role),
  publishFinancialStatement: (role: Role) =>
    ["financial_secretary", "treasurer"].includes(role),
  scheduleMeeting: (role: Role) =>
    ["president", "vice_president", "male_organizer", "female_organizer"].includes(role),
  markAttendance: (role: Role) =>
    ["president", "vice_president", "male_organizer", "female_organizer"].includes(role),
  sendBibleQuote: (role: Role) =>
    ["president", "vice_president", "evangelism_coordinator"].includes(role),
  checkAbsentMembers: (role: Role) =>
    ["president", "vice_president", "evangelism_coordinator", "male_organizer", "female_organizer"].includes(role),
  accessAdmin: (role: Role) => isPresident(role),
};
