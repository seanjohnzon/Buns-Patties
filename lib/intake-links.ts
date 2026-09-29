// Which intake form each private link opens: /intake?c=<code>. Add a client by
// adding their JSON in data/intake/ and a line here (and a row in client_intake).
import bp from '@/data/intake/buns-and-patties.json';
import type { IntakeConfig } from './intake';

export const INTAKE_LINKS: Record<string, IntakeConfig> = {
  'bp-7f3k9q': bp as IntakeConfig,
};

export function intakeFor(code: string | undefined): IntakeConfig | null {
  return (code && INTAKE_LINKS[code]) || null;
}
