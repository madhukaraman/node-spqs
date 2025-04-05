// Export main service class
export { PriorityQueueService } from './services/PriorityQueueService';

// Export utility classes
export { Logger, LogLevel } from './utils/logger';
export { MetricsCollector } from './utils/metrics';

// Export types
export {
  PriorityQueueServiceOptions,
  SendMessageParams,
  ReceiveMessageParams,
  PriorityMessage,
  QueueDepthByPriority,
  ProcessingLatencyByPriority,
  MessageMetadata
} from './types';

// Export configuration
export { DEFAULT_CONFIG, isValidPriority } from './config';
