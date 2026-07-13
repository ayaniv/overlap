export interface LoggerService {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(error: unknown): void;
}
