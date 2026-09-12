export type Department = { id: string; name: string };
export type ProjectTeam = { id: string; departmentId: string; name: string };

// Sample memberships only. Live membership must come from the verified Core adapter.
export const departments: Department[] = [
  { id: "manufacturing", name: "Manufacturing" },
  { id: "development", name: "Product Development" }
];
export const projectTeams: ProjectTeam[] = [
  { id: "fermentation", departmentId: "manufacturing", name: "Fermentation Team" },
  { id: "sachets", departmentId: "manufacturing", name: "Sachet Team" },
  { id: "pilot", departmentId: "development", name: "Pilot Projects" }
];
export const demoMembers = [
  { id: "aida", name: "Aida - Planner", role: "planner", teamIds: ["fermentation", "sachets"] },
  { id: "lim", name: "Lim - Production", role: "production", teamIds: ["fermentation"] },
  { id: "kumar", name: "Kumar - Production", role: "production", teamIds: ["sachets"] },
  { id: "mei", name: "Mei - Development Planner", role: "planner", teamIds: ["pilot"] },
  { id: "admin", name: "Administrator - Master Data", role: "admin", teamIds: ["fermentation", "sachets", "pilot"] }
];

export function scopeRecords<T extends { teamId?: string }>(records: T[], assignedTeamIds: readonly string[], selectedTeamId: string): T[] {
  if (!assignedTeamIds.includes(selectedTeamId)) return [];
  return records.filter((record) => record.teamId === selectedTeamId);
}
