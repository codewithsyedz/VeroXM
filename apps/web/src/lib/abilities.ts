// Shared between AccessTokens.tsx (static API keys) and ApiAuthUsersTab.tsx
// (username/password credentials) -- both mint a public-API credential
// with the same four Sanctum-style abilities (see
// apps/api/src/public-api/require-ability.decorator.ts and
// PublicApiAuthService.can()), so the checkbox options and the
// abilities -> label formatting live here once rather than drifting
// between the two UIs -- same "shared, not duplicated" approach as
// lib/example-value.ts.
export type Ability = "read" | "create" | "update" | "delete";

export const ABILITY_OPTIONS: Array<{ value: Ability; label: string; description: string }> = [
  { value: "create", label: "Create", description: "Can create new content" },
  { value: "read", label: "Read", description: "Can read content" },
  { value: "update", label: "Update", description: "Can update existing content" },
  { value: "delete", label: "Delete", description: "Can delete content" },
];

export function abilityLabel(abilities: string[]): string {
  if (abilities.includes("*")) return "Full access";
  const order: Ability[] = ["create", "read", "update", "delete"];
  const labels: Record<Ability, string> = {
    create: "Create",
    read: "Read",
    update: "Update",
    delete: "Delete",
  };
  const present = order.filter((a) => abilities.includes(a)).map((a) => labels[a]);
  return present.length ? present.join(", ") : "No permissions";
}
