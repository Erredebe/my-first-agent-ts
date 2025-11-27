export enum LogLevel {
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

export class Logger {
  private static formatMessage(level: LogLevel, message: string, context?: string): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` [${context}]` : "";
    return `[${timestamp}] [${level}]${contextStr} ${message}`;
  }

  static info(message: string, context?: string): void {
    console.log(this.formatMessage(LogLevel.INFO, message, context));
  }

  static warn(message: string, context?: string): void {
    console.warn(this.formatMessage(LogLevel.WARN, message, context));
  }

  static error(message: string, error?: unknown, context?: string): void {
    const errorStr = error instanceof Error ? error.message : String(error);
    console.error(this.formatMessage(LogLevel.ERROR, `${message} - ${errorStr}`, context));
  }
}
