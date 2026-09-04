// the debug/info/warn trio every LoggerService implementation needs — shared
// so postHogLogger and the extension's httpPostHogService don't each carry
// their own copy of the same three console calls
export const consoleLogParts = {
  debug(message: string): void {
    console.debug(`overlap: ${message}`);
  },
  info(message: string): void {
    console.info(`overlap: ${message}`);
  },
  warn(message: string): void {
    console.warn(`overlap: ${message}`);
  },
};
