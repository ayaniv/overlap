export interface LoggerService {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  // context: a short, specific description of what failed (e.g. "failed to
  // quick-schedule a meeting from the scrub buttons") — never omit it in
  // favor of a bare error object; see barvaz's trackError-context rule
  error(error: unknown, context: string): void;
}
