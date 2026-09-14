import { SetMetadata } from '@nestjs/common';

export const ABILITY_KEY = 'public_api_ability';

// Marks the Sanctum-style ability a route needs (read/create/update/delete),
// matching the legacy app's per-method $auth->tokenCan(...) checks.
export const RequireAbility = (ability: 'read' | 'create' | 'update' | 'delete') =>
  SetMetadata(ABILITY_KEY, ability);
