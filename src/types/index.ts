/**
 * Configuration options for the PriorityQueueService
 */
export interface PriorityQueueServiceOptions {
  /** AWS region */
  region: string;
  /** SQS queue URL */
  queueUrl: string;
  /** Redis connection URL */
  redisUrl: string;
  /** Number of priority levels (default: 3) */
  priorityLevels?: number;
  /** Visibility timeout in seconds (default: 30) */
  visibilityTimeout?: number;
  /** Wait time for long polling in seconds (default: 20) */
  waitTimeSeconds?: number;
  /** Threshold for preventing starvation of lower priority messages (default: 100) */
  starvationPreventionThreshold?: number;
  /** AWS SDK configuration options */
  awsConfig?: {
    accessKeyId?: string;
    secretAccessKey?: string;
    [key: string]: any;
  };
}

/**
 * Message to be sent to the queue
 */
export interface SendMessageParams {
  /** Message body */
  body: string;
  /** Message priority (0 is highest) */
  priority: number;
  /** Optional message attributes */
  attributes?: Record<string, string>;
  /** Optional message group ID (for FIFO queues) */
  messageGroupId?: string;
  /** Optional message deduplication ID (for FIFO queues) */
  messageDeduplicationId?: string;
  /** Optional delay in seconds */
  delaySeconds?: number;
}

/**
 * Parameters for receiving messages
 */
export interface ReceiveMessageParams {
  /** Maximum number of messages to receive (default: 10) */
  maxMessages?: number;
  /** Visibility timeout override in seconds */
  visibilityTimeout?: number;
  /** Wait time override in seconds */
  waitTimeSeconds?: number;
  /** Whether to include message attributes */
  includeAttributes?: boolean;
}

/**
 * Message received from the queue
 */
export interface PriorityMessage {
  /** Message ID */
  id: string;
  /** Message body */
  body: string;
  /** Message priority */
  priority: number;
  /** Receipt handle (needed for deletion) */
  receiptHandle: string;
  /** When the message was sent */
  sentTimestamp?: number;
  /** Message attributes */
  attributes?: Record<string, string>;
  /** First receive timestamp */
  firstReceiveTimestamp?: number;
  /** Receive count */
  receiveCount?: number;
}

/**
 * Queue depth by priority level
 */
export interface QueueDepthByPriority {
  [priority: number]: number;
}

/**
 * Processing latency by priority level (in milliseconds)
 */
export interface ProcessingLatencyByPriority {
  [priority: number]: number;
}

/**
 * Internal message metadata stored in Redis
 */
export interface MessageMetadata {
  /** Message ID */
  id: string;
  /** Message priority */
  priority: number;
  /** When the message was sent (timestamp) */
  sentAt: number;
  /** When the message was first received (timestamp) */
  firstReceivedAt?: number;
  /** When the message was last received (timestamp) */
  lastReceivedAt?: number;
  /** Number of times the message has been received */
  receiveCount: number;
}
