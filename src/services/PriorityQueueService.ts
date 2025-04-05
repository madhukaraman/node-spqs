import { 
  PriorityQueueServiceOptions, 
  SendMessageParams, 
  ReceiveMessageParams, 
  PriorityMessage,
  QueueDepthByPriority,
  ProcessingLatencyByPriority,
  MessageMetadata
} from '../types';
import { DEFAULT_CONFIG, isValidPriority } from '../config';
import { SQSManager } from './SQSManager';
import { RedisManager } from './RedisManager';
import { Logger, LogLevel } from '../utils/logger';
import { MetricsCollector } from '../utils/metrics';

/**
 * Main service class for the priority queue
 */
export class PriorityQueueService {
  private sqsManager: SQSManager;
  private redisManager: RedisManager;
  private logger: Logger;
  private metricsCollector: MetricsCollector;
  private priorityLevels: number;
  private starvationPreventionThreshold: number;
  private options: PriorityQueueServiceOptions;

  /**
   * Creates a new priority queue service
   * 
   * @param options - Configuration options
   */
  constructor(options: PriorityQueueServiceOptions) {
    this.options = options;
    this.priorityLevels = options.priorityLevels || DEFAULT_CONFIG.PRIORITY_LEVELS;
    this.starvationPreventionThreshold = options.starvationPreventionThreshold || DEFAULT_CONFIG.STARVATION_PREVENTION_THRESHOLD;
    this.logger = new Logger('PriorityQueueService');
    this.metricsCollector = new MetricsCollector(this.priorityLevels);
    
    // Initialize SQS manager
    this.sqsManager = new SQSManager(
      options.region,
      options.queueUrl,
      options.visibilityTimeout,
      options.waitTimeSeconds,
      options.awsConfig
    );
    
    // Initialize Redis manager
    this.redisManager = new RedisManager(
      options.redisUrl,
      this.priorityLevels
    );
  }

  /**
   * Connects to the required services
   */
  async connect(): Promise<void> {
    try {
      await this.redisManager.connect();
      this.logger.info('Connected to services');
    } catch (error) {
      this.logger.error('Failed to connect to services', error);
      throw error;
    }
  }

  /**
   * Disconnects from the services
   */
  async disconnect(): Promise<void> {
    try {
      await this.redisManager.disconnect();
      this.logger.info('Disconnected from services');
    } catch (error) {
      this.logger.error('Failed to disconnect from services', error);
      throw error;
    }
  }

  /**
   * Sends a message to the queue with the specified priority
   * 
   * @param params - The message parameters
   * @returns The message ID
   */
  async sendMessage(params: SendMessageParams): Promise<string> {
    // Validate priority
    if (!isValidPriority(params.priority, this.priorityLevels)) {
      throw new Error(`Invalid priority: ${params.priority}. Must be between 0 and ${this.priorityLevels - 1}`);
    }
    
    try {
      // Send message to SQS
      const messageId = await this.sqsManager.sendMessage(params);
      
      // Store message metadata in Redis
      const metadata: MessageMetadata = {
        id: messageId,
        priority: params.priority,
        sentAt: Date.now(),
        receiveCount: 0
      };
      
      await this.redisManager.addMessage(messageId, params.priority, metadata);
      
      // Update metrics
      const queueDepth = await this.redisManager.getQueueDepthByPriority();
      Object.entries(queueDepth).forEach(([priority, depth]) => {
        this.metricsCollector.updateQueueDepth(parseInt(priority), depth);
      });
      
      this.logger.info(`Sent message with ID ${messageId} and priority ${params.priority}`);
      
      return messageId;
    } catch (error) {
      this.logger.error('Failed to send message', error);
      throw error;
    }
  }

  /**
   * Receives messages from the queue, prioritized by priority level
   * 
   * @param params - The receive parameters
   * @returns Array of prioritized messages
   */
  async receiveMessages(params?: ReceiveMessageParams): Promise<PriorityMessage[]> {
    try {
      const maxMessages = params?.maxMessages || DEFAULT_CONFIG.MAX_MESSAGES;
      
      // Get message IDs from Redis based on priority
      const messageIds = await this.redisManager.getNextMessages(
        maxMessages,
        this.starvationPreventionThreshold
      );
      
      if (messageIds.length === 0) {
        // this.logger.debug('No messages to receive based on priority');
        return [];
      }
      
      // Receive messages from SQS
      const sqsMessages = await this.sqsManager.receiveMessages({
        ...params,
        maxMessages: maxMessages
      });
      
      if (sqsMessages.length === 0) {
        this.logger.debug('No messages received from SQS');
        return [];
      }
      
      // Filter and prioritize messages based on the IDs from Redis
      const prioritizedMessages: PriorityMessage[] = [];
      
      for (const sqsMessage of sqsMessages) {
        if (!sqsMessage.MessageId) continue;
        
        // Get message metadata from Redis
        const metadata = await this.redisManager.getMessageMetadata(sqsMessage.MessageId);
        
        if (metadata) {
          // Mark message as received in Redis
          await this.redisManager.markMessageAsReceived(sqsMessage.MessageId);
          
          // Extract priority and other attributes
          const priority = metadata.priority;
          
          // Parse message attributes
          const attributes: Record<string, string> = {};
          if (sqsMessage.MessageAttributes) {
            Object.entries(sqsMessage.MessageAttributes).forEach(([key, attr]) => {
              if (attr.StringValue) {
                attributes[key] = attr.StringValue;
              }
            });
          }
          
          // Create prioritized message
          const priorityMessage: PriorityMessage = {
            id: sqsMessage.MessageId,
            body: sqsMessage.Body || '',
            priority,
            receiptHandle: sqsMessage.ReceiptHandle || '',
            sentTimestamp: metadata.sentAt,
            attributes,
            firstReceiveTimestamp: metadata.firstReceivedAt,
            receiveCount: metadata.receiveCount
          };
          
          // Start tracking processing time for metrics
          this.metricsCollector.startMessageProcessing(sqsMessage.MessageId);
          
          prioritizedMessages.push(priorityMessage);
        }
      }
      
      // Update queue depth metrics
      const queueDepth = await this.redisManager.getQueueDepthByPriority();
      Object.entries(queueDepth).forEach(([priority, depth]) => {
        this.metricsCollector.updateQueueDepth(parseInt(priority), depth);
      });
      
      this.logger.info(`Received ${prioritizedMessages.length} prioritized messages`);
      
      return prioritizedMessages;
    } catch (error) {
      this.logger.error('Failed to receive messages', error);
      throw error;
    }
  }

  /**
   * Deletes a message from the queue
   * 
   * @param receiptHandle - The receipt handle of the message to delete
   * @param messageId - The message ID
   * @param priority - The message priority
   */
  async deleteMessage(receiptHandle: string, messageId?: string, priority?: number): Promise<void> {
    try {
      // Delete from SQS
      await this.sqsManager.deleteMessage(receiptHandle);
      
      // If message ID and priority are provided, remove from Redis
      if (messageId && priority !== undefined) {
        await this.redisManager.removeMessage(messageId, priority);
        
        // End tracking processing time for metrics
        this.metricsCollector.endMessageProcessing(messageId, priority);
        
        // Update queue depth metrics
        const queueDepth = await this.redisManager.getQueueDepthByPriority();
        Object.entries(queueDepth).forEach(([p, depth]) => {
          this.metricsCollector.updateQueueDepth(parseInt(p), depth);
        });
      }
      
      this.logger.debug(`Deleted message ${messageId || ''}`);
    } catch (error) {
      this.logger.error('Failed to delete message', error);
      throw error;
    }
  }

  /**
   * Changes the visibility timeout of a message
   * 
   * @param receiptHandle - The receipt handle of the message
   * @param visibilityTimeout - The new visibility timeout in seconds
   */
  async changeMessageVisibility(receiptHandle: string, visibilityTimeout: number): Promise<void> {
    try {
      await this.sqsManager.changeMessageVisibility(receiptHandle, visibilityTimeout);
      this.logger.debug(`Changed message visibility timeout to ${visibilityTimeout} seconds`);
    } catch (error) {
      this.logger.error('Failed to change message visibility', error);
      throw error;
    }
  }

  /**
   * Gets the current queue depth by priority level
   * 
   * @returns The queue depth by priority level
   */
  async getQueueDepthByPriority(): Promise<QueueDepthByPriority> {
    try {
      return await this.redisManager.getQueueDepthByPriority();
    } catch (error) {
      this.logger.error('Failed to get queue depth by priority', error);
      throw error;
    }
  }

  /**
   * Gets the processing latency by priority level
   * 
   * @returns The processing latency by priority level (in milliseconds)
   */
  async getProcessingLatencyByPriority(): Promise<ProcessingLatencyByPriority> {
    try {
      return await this.redisManager.getProcessingLatencyByPriority();
    } catch (error) {
      this.logger.error('Failed to get processing latency by priority', error);
      throw error;
    }
  }

  /**
   * Purges all messages from the queue
   */
  async purgeQueue(): Promise<void> {
    try {
      // Purge SQS queue
      await this.sqsManager.purgeQueue();
      
      // Reset metrics
      this.metricsCollector.resetMetrics();
      
      this.logger.info('Purged queue');
    } catch (error) {
      this.logger.error('Failed to purge queue', error);
      throw error;
    }
  }

  /**
   * Sets the log level for the service
   * 
   * @param level - The log level
   */
  setLogLevel(level: LogLevel): void {
    this.logger.setLevel(level);
  }
}
