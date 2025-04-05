import { createClient, RedisClientType } from 'redis';
import { MessageMetadata, QueueDepthByPriority } from '../types';
import { DEFAULT_CONFIG } from '../config';
import { Logger, LogLevel } from '../utils/logger';

/**
 * Manages Redis operations for the priority queue service
 */
export class RedisManager {
  private client: RedisClientType;
  private redisUrl: string;
  private keyPrefix: string;
  private priorityLevels: number;
  private logger: Logger;
  private connected: boolean = false;

  /**
   * Creates a new Redis manager
   * 
   * @param redisUrl - The Redis connection URL
   * @param priorityLevels - The number of priority levels
   * @param keyPrefix - Optional key prefix for Redis keys
   */
  constructor(
    redisUrl: string,
    priorityLevels: number = DEFAULT_CONFIG.PRIORITY_LEVELS,
    keyPrefix: string = DEFAULT_CONFIG.REDIS_KEY_PREFIX
  ) {
    this.redisUrl = redisUrl;
    this.keyPrefix = keyPrefix;
    this.priorityLevels = priorityLevels;
    this.logger = new Logger('RedisManager');
    this.client = createClient({ url: this.redisUrl });

    // Set up error handling
    this.client.on('error', (err) => {
      this.logger.error('Redis client error', err);
      this.connected = false;
    });
  }

  /**
   * Connects to Redis
   */
  async connect(): Promise<void> {
    try {
      await this.client.connect();
      this.connected = true;
      this.logger.info('Connected to Redis');
    } catch (error) {
      this.logger.error('Failed to connect to Redis', error);
      throw error;
    }
  }

  /**
   * Disconnects from Redis
   */
  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.quit();
      this.connected = false;
      this.logger.info('Disconnected from Redis');
    }
  }

  /**
   * Checks if the Redis client is connected
   * 
   * @returns True if connected, false otherwise
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Gets the Redis key for a priority queue
   * 
   * @param priority - The priority level
   * @returns The Redis key
   */
  private getPriorityQueueKey(priority: number): string {
    return `${this.keyPrefix}${DEFAULT_CONFIG.REDIS_PRIORITY_QUEUE_KEY}${priority}`;
  }

  /**
   * Gets the Redis key for message metadata
   * 
   * @param messageId - The message ID
   * @returns The Redis key
   */
  private getMessageMetadataKey(messageId: string): string {
    return `${this.keyPrefix}${DEFAULT_CONFIG.REDIS_MESSAGE_METADATA_KEY}${messageId}`;
  }

  /**
   * Adds a message to the priority queue
   * 
   * @param messageId - The message ID
   * @param priority - The message priority
   * @param metadata - The message metadata
   */
  async addMessage(messageId: string, priority: number, metadata: MessageMetadata): Promise<void> {
    if (!this.connected) {
      throw new Error('Redis client is not connected');
    }

    const now = Date.now();
    
    try {
      // Store message metadata
      await this.client.set(
        this.getMessageMetadataKey(messageId),
        JSON.stringify({ ...metadata, sentAt: now, receiveCount: 0 })
      );
      
      // Add message to the priority queue with score as timestamp for FIFO ordering
      await this.client.zAdd(this.getPriorityQueueKey(priority), {
        score: now,
        value: messageId
      });
      
      this.logger.debug(`Added message ${messageId} with priority ${priority}`);
    } catch (error) {
      this.logger.error(`Failed to add message ${messageId}`, error);
      throw error;
    }
  }

  /**
   * Gets the next batch of messages to process based on priority
   * 
   * @param maxMessages - Maximum number of messages to get
   * @param starvationThreshold - Threshold for preventing starvation of lower priority messages
   * @returns Array of message IDs
   */
  async getNextMessages(
    maxMessages: number = DEFAULT_CONFIG.MAX_MESSAGES,
    starvationThreshold: number = DEFAULT_CONFIG.STARVATION_PREVENTION_THRESHOLD
  ): Promise<string[]> {
    if (!this.connected) {
      throw new Error('Redis client is not connected');
    }

    const result: string[] = [];
    const queueSizes: number[] = [];
    
    // First, check queue sizes for all priority levels
    for (let priority = 0; priority < this.priorityLevels; priority++) {
      const size = await this.client.zCard(this.getPriorityQueueKey(priority));
      queueSizes[priority] = size;
    }
    
    // Determine if we need to prevent starvation of lower priority messages
    let preventStarvation = false;
    for (let priority = 1; priority < this.priorityLevels; priority++) {
      if (queueSizes[priority] > starvationThreshold) {
        preventStarvation = true;
        break;
      }
    }
    
    // If preventing starvation, distribute messages across priorities
    if (preventStarvation) {
      this.logger.info('Preventing starvation of lower priority messages');
      
      // Calculate messages to take from each priority level
      const totalMessages = queueSizes.reduce((sum, size) => sum + size, 0);
      const messagesRemaining = Math.min(maxMessages, totalMessages);
      
      if (messagesRemaining > 0) {
        // Distribute based on queue size proportions, but ensure at least one from each non-empty queue
        const nonEmptyQueues = queueSizes.filter(size => size > 0).length;
        let allocated = 0;
        
        for (let priority = 0; priority < this.priorityLevels; priority++) {
          if (queueSizes[priority] > 0) {
            // Ensure at least one message from each non-empty queue
            const minAllocation = 1;
            
            // Calculate proportional allocation
            const proportion = queueSizes[priority] / totalMessages;
            const proportionalAllocation = Math.floor(messagesRemaining * proportion);
            
            // Take the maximum of minimum allocation and proportional allocation
            const toTake = Math.min(
              Math.max(minAllocation, proportionalAllocation),
              queueSizes[priority],
              messagesRemaining - allocated
            );
            
            if (toTake > 0) {
              const messages = await this.client.zRange(
                this.getPriorityQueueKey(priority),
                0,
                toTake - 1
              );
              
              result.push(...messages);
              allocated += messages.length;
              
              if (allocated >= messagesRemaining) {
                break;
              }
            }
          }
        }
      }
    } else {
      // Normal priority-based processing
      for (let priority = 0; priority < this.priorityLevels; priority++) {
        if (queueSizes[priority] > 0) {
          const toTake = Math.min(maxMessages - result.length, queueSizes[priority]);
          
          if (toTake > 0) {
            const messages = await this.client.zRange(
              this.getPriorityQueueKey(priority),
              0,
              toTake - 1
            );
            
            result.push(...messages);
            
            if (result.length >= maxMessages) {
              break;
            }
          }
        }
      }
    }
    
    return result;
  }

  /**
   * Gets message metadata
   * 
   * @param messageId - The message ID
   * @returns The message metadata or null if not found
   */
  async getMessageMetadata(messageId: string): Promise<MessageMetadata | null> {
    if (!this.connected) {
      throw new Error('Redis client is not connected');
    }

    try {
      const data = await this.client.get(this.getMessageMetadataKey(messageId));
      
      if (data) {
        return JSON.parse(data) as MessageMetadata;
      }
      
      return null;
    } catch (error) {
      this.logger.error(`Failed to get metadata for message ${messageId}`, error);
      throw error;
    }
  }

  /**
   * Updates message metadata when a message is received
   * 
   * @param messageId - The message ID
   */
  async markMessageAsReceived(messageId: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Redis client is not connected');
    }

    try {
      const metadata = await this.getMessageMetadata(messageId);
      
      if (metadata) {
        const now = Date.now();
        const updatedMetadata: MessageMetadata = {
          ...metadata,
          lastReceivedAt: now,
          firstReceivedAt: metadata.firstReceivedAt || now,
          receiveCount: (metadata.receiveCount || 0) + 1
        };
        
        await this.client.set(
          this.getMessageMetadataKey(messageId),
          JSON.stringify(updatedMetadata)
        );
        
        this.logger.debug(`Marked message ${messageId} as received`);
      }
    } catch (error) {
      this.logger.error(`Failed to mark message ${messageId} as received`, error);
      throw error;
    }
  }

  /**
   * Removes a message from the priority queue and deletes its metadata
   * 
   * @param messageId - The message ID
   * @param priority - The message priority
   */
  async removeMessage(messageId: string, priority: number): Promise<void> {
    if (!this.connected) {
      throw new Error('Redis client is not connected');
    }

    try {
      // Remove from priority queue
      await this.client.zRem(this.getPriorityQueueKey(priority), messageId);
      
      // Delete metadata
      await this.client.del(this.getMessageMetadataKey(messageId));
      
      this.logger.debug(`Removed message ${messageId} with priority ${priority}`);
    } catch (error) {
      this.logger.error(`Failed to remove message ${messageId}`, error);
      throw error;
    }
  }

  /**
   * Gets the current queue depth by priority level
   * 
   * @returns The queue depth by priority level
   */
  async getQueueDepthByPriority(): Promise<QueueDepthByPriority> {
    if (!this.connected) {
      throw new Error('Redis client is not connected');
    }

    const result: QueueDepthByPriority = {};
    
    for (let priority = 0; priority < this.priorityLevels; priority++) {
      const size = await this.client.zCard(this.getPriorityQueueKey(priority));
      result[priority] = size;
    }
    
    return result;
  }

  /**
   * Stores processing latency metrics in Redis
   * 
   * @param priority - The priority level
   * @param latency - The processing latency in milliseconds
   */
  async storeProcessingLatency(priority: number, latency: number): Promise<void> {
    if (!this.connected) {
      throw new Error('Redis client is not connected');
    }

    try {
      const key = `${this.keyPrefix}${DEFAULT_CONFIG.REDIS_METRICS_KEY}latency:${priority}`;
      
      // Get current latency value
      const currentValue = await this.client.get(key);
      const currentLatency = currentValue ? parseFloat(currentValue) : 0;
      
      // Calculate new latency using exponential moving average
      const newLatency = currentLatency === 0 
        ? latency 
        : (currentLatency * 0.9) + (latency * 0.1);
      
      // Store updated latency
      await this.client.set(key, newLatency.toString());
    } catch (error) {
      this.logger.error(`Failed to store processing latency for priority ${priority}`, error);
      throw error;
    }
  }

  /**
   * Gets the processing latency by priority level
   * 
   * @returns The processing latency by priority level (in milliseconds)
   */
  async getProcessingLatencyByPriority(): Promise<Record<number, number>> {
    if (!this.connected) {
      throw new Error('Redis client is not connected');
    }

    const result: Record<number, number> = {};
    
    for (let priority = 0; priority < this.priorityLevels; priority++) {
      const key = `${this.keyPrefix}${DEFAULT_CONFIG.REDIS_METRICS_KEY}latency:${priority}`;
      const value = await this.client.get(key);
      result[priority] = value ? Math.round(parseFloat(value)) : 0;
    }
    
    return result;
  }
}
