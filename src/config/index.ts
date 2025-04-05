/**
 * Default configuration values for the PriorityQueueService
 */
export const DEFAULT_CONFIG = {
  /** Default number of priority levels */
  PRIORITY_LEVELS: 3,
  /** Default visibility timeout in seconds */
  VISIBILITY_TIMEOUT: 30,
  /** Default wait time for long polling in seconds */
  WAIT_TIME_SECONDS: 20,
  /** Default maximum number of messages to receive */
  MAX_MESSAGES: 10,
  /** Default threshold for preventing starvation of lower priority messages */
  STARVATION_PREVENTION_THRESHOLD: 100,
  /** Redis key prefix for priority queue data */
  REDIS_KEY_PREFIX: 'pq:',
  /** Redis key for tracking message metadata */
  REDIS_MESSAGE_METADATA_KEY: 'message-metadata:',
  /** Redis key for tracking priority queues */
  REDIS_PRIORITY_QUEUE_KEY: 'priority-queue:',
  /** Redis key for tracking metrics */
  REDIS_METRICS_KEY: 'metrics:',
  /** Default Redis connection timeout in milliseconds */
  REDIS_CONNECTION_TIMEOUT: 5000,
};

/**
 * Validates a priority value against the configured number of priority levels
 * 
 * @param priority - The priority value to validate
 * @param priorityLevels - The configured number of priority levels
 * @returns True if the priority is valid, false otherwise
 */
export function isValidPriority(priority: number, priorityLevels: number): boolean {
  return Number.isInteger(priority) && priority >= 0 && priority < priorityLevels;
}
