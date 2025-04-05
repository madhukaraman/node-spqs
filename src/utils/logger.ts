/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Simple logger utility
 */
export class Logger {
  private context: string;
  private level: LogLevel;

  /**
   * Creates a new logger instance
   * 
   * @param context - The context for the logger (e.g., class name)
   * @param level - The minimum log level to output
   */
  constructor(context: string, level: LogLevel = LogLevel.INFO) {
    this.context = context;
    this.level = level;
  }

  /**
   * Logs a debug message
   * 
   * @param message - The message to log
   * @param data - Optional data to include
   */
  debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * Logs an info message
   * 
   * @param message - The message to log
   * @param data - Optional data to include
   */
  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  /**
   * Logs a warning message
   * 
   * @param message - The message to log
   * @param data - Optional data to include
   */
  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  /**
   * Logs an error message
   * 
   * @param message - The message to log
   * @param error - Optional error to include
   */
  error(message: string, error?: any): void {
    this.log(LogLevel.ERROR, message, error);
  }

  /**
   * Internal method to log a message
   * 
   * @param level - The log level
   * @param message - The message to log
   * @param data - Optional data to include
   */
  private log(level: LogLevel, message: string, data?: any): void {
    if (this.shouldLog(level)) {
      const timestamp = new Date().toISOString();
      const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] [${this.context}] ${message}`;
      
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(formattedMessage, data ? data : '');
          break;
        case LogLevel.INFO:
          console.info(formattedMessage, data ? data : '');
          break;
        case LogLevel.WARN:
          console.warn(formattedMessage, data ? data : '');
          break;
        case LogLevel.ERROR:
          console.error(formattedMessage, data ? data : '');
          break;
      }
    }
  }

  /**
   * Determines if a message should be logged based on the configured level
   * 
   * @param level - The log level to check
   * @returns True if the message should be logged, false otherwise
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const configuredLevelIndex = levels.indexOf(this.level);
    const messageLevelIndex = levels.indexOf(level);
    
    return messageLevelIndex >= configuredLevelIndex;
  }

  /**
   * Sets the log level
   * 
   * @param level - The new log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }
}
