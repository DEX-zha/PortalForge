// Errors and argument checks shared by every command.
//
// Exit codes (specs/001-ssa-level-research/contracts/ssa-archive-cli.md):
//   0 success, 1 validation or experiment failure, 2 unsupported input, 3 usage or I/O error.
export const EXIT = Object.freeze({ OK: 0, FAILED: 1, UNSUPPORTED: 2, USAGE: 3 });

export class CliError extends Error {
  constructor(message, exitCode = EXIT.USAGE) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }
}

// Returns the value, or fails with a usage error naming the missing argument.
export function need(value, name) {
  if (value === undefined || value === null || value === '') throw new CliError(`Missing --${name}`, EXIT.USAGE);
  return value;
}
