export type Role =
  | "super_admin"
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
  super_admin: "Admin",
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
  super_admin: "bg-gray-900 text-[#f0c940]",
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
// "super_admin" is deliberately excluded: it is a system-owner role assigned out-of-band (setup script),
// not a church office selectable from the admin panel.
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

/** The system-owner role. It sits above every church office. */
export const isSuperAdmin = (role: Role) => role === "super_admin";

// super_admin is a member of EVERY permission group below. Rather than bypassing the
// permission model, it participates in it — so all the existing checks keep working and
// simply also return true for super_admin. This keeps a single source of truth for access.
export const can = {
  viewAllMembers: (role: Role) => isSuperAdmin(role) || !["member", "pending"].includes(role),
  manageMembers: (role: Role) => isSuperAdmin(role) || isPresident(role),
  manageDues: (role: Role) => ["super_admin", "financial_secretary", "treasurer"].includes(role),
  viewDuesStatus: (role: Role) => ["super_admin", "president", "financial_secretary", "treasurer"].includes(role),
  sendDuesReminder: (role: Role) => ["super_admin", "financial_secretary"].includes(role),
  sendBroadcast: (role: Role) =>
    ["super_admin", "president", "vice_president", "general_secretary", "assistant_general_secretary"].includes(role),
  viewFinance: (role: Role) =>
    ["super_admin", "president", "vice_president", "financial_secretary", "treasurer"].includes(role),
  editFinance: (role: Role) =>
    ["super_admin", "financial_secretary", "treasurer"].includes(role),
  publishFinancialStatement: (role: Role) =>
    ["super_admin", "financial_secretary", "treasurer"].includes(role),
  // Only President and General Secretary can publish reports directly.
  publishReport: (role: Role) =>
    ["super_admin", "president", "general_secretary"].includes(role),
  // Vice President and Assistant General Secretary can draft/submit reports (text or PDF),
  // but they need President/General Secretary approval before publishing.
  draftReport: (role: Role) =>
    ["super_admin", "president", "general_secretary", "vice_president", "assistant_general_secretary"].includes(role),
  approveReport: (role: Role) =>
    ["super_admin", "president", "general_secretary"].includes(role),
  scheduleMeeting: (role: Role) =>
    ["super_admin", "president", "vice_president", "male_organizer", "female_organizer"].includes(role),
  markAttendance: (role: Role) =>
    ["super_admin", "president", "vice_president", "male_organizer", "female_organizer"].includes(role),
  // Evangelism Coordinator is an executive title only — no special bible-quote privileges beyond a member.
  sendBibleQuote: (role: Role) =>
    ["super_admin", "president", "vice_president"].includes(role),
  checkAbsentMembers: (role: Role) =>
    ["super_admin", "president", "vice_president", "male_organizer", "female_organizer"].includes(role),
  accessAdmin: (role: Role) => isSuperAdmin(role) || isPresident(role),
  viewDateOfBirth: (role: Role) => ["super_admin", "president", "vice_president", "general_secretary"].includes(role),
  // The back-office console is exclusive to the system owner.
  accessConsole: (role: Role) => isSuperAdmin(role),
  // The super admin is a back-office monitor, not a congregation participant:
  // it neither sends nor reads member messages, and it pays no dues.
  useMessaging: (role: Role) => !isSuperAdmin(role),
  paysDues: (role: Role) => !isSuperAdmin(role),
  // The member dashboard/home is for congregants; the super admin uses the console instead.
  viewMemberDashboard: (role: Role) => !isSuperAdmin(role),
  // Elections: the owner and the President organise them.
  manageElections: (role: Role) => ["super_admin", "president"].includes(role),
  // Everyone who is an actual member may cast a ballot (the super admin is not a member).
  voteInElections: (role: Role) => !isSuperAdmin(role) && !["pending", "rejected"].includes(role),
};
