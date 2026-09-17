// A command group is a table of subcommand handlers. Keeping the table explicit, rather than a chain of
// `if (sub === ...)`, makes the set of subcommands readable at a glance and lets the usage text be derived
// from the same source as the behaviour.
import { CliError, EXIT } from './errors.mjs';

// Looks a subcommand up in its table, or fails with the usage error for that group.
//   describe: builds the error message from the unknown name, so each group keeps its own wording.
export function pickSubcommand(table, name, describe) {
  const handler = Object.hasOwn(table, name) ? table[name] : null;
  if (!handler) throw new CliError(describe(name), EXIT.USAGE);
  return handler;
}
