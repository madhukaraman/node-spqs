import { QueueDepthByPriority, ProcessingLatencyByPriority } from '../types';

/**
 * Metrics collector for the priority queue service
 */
export class MetricsCollector {
  private queueDepthByPriority: QueueDepthByPriority = {};
  private processingLatencyByPriority: ProcessingLatencyByPriority = {};
  private messageProcessingStartTimes: Map<string, number> = new Map();
  private priorityLevels: number;

  /**
   * Creates a new metrics collector
   * 
   * @param priorityLevels - The number of priority levels
   */
  constructor(priorityLevels: number) {
    this.priorityLevels = priorityLevels;
    this.initializeMetrics();
  }

  /**
   * Initializes metrics with zero values for all priority levels
   */
  private initializeMetrics(): void {
    for (let i = 0; i < this.priorityLevels; i++) {
      this.queueDepthByPriority[i] = 0;
      this.processingLatencyByPriority[i] = 0;
    }
  }

  /**
   * Updates the queue depth for a specific priority level
   * 
   * @param priority - The priority level
   * @param depth - The new queue depth
   */
  updateQueueDepth(priority: number, depth: number): void {
    if (priority >= 0 && priority < this.priorityLevels) {
      this.queueDepthByPriority[priority] = depth;
    }
  }

  /**
   * Gets the current queue depth by priority level
   * 
   * @returns The queue depth by priority level
   */
  getQueueDepthByPriority(): QueueDepthByPriority {
    return { ...this.queueDepthByPriority };
  }

  /**
   * Records the start of message processing
   * 
   * @param messageId - The message ID
   */
  startMessageProcessing(messageId: string): void {
    this.messageProcessingStartTimes.set(messageId, Date.now());
  }

  /**
   * Records the end of message processing and updates latency metrics
   * 
   * @param messageId - The message ID
   * @param priority - The message priority
   */
  endMessageProcessing(messageId: string, priority: number): void {
    const startTime = this.messageProcessingStartTimes.get(messageId);
    if (startTime && priority >= 0 && priority < this.priorityLevels) {
      const processingTime = Date.now() - startTime;
      
      // Update the moving average for this priority level
      const currentLatency = this.processingLatencyByPriority[priority];
      const newLatency = currentLatency === 0 
        ? processingTime 
        : (currentLatency * 0.9) + (processingTime * 0.1); // Simple exponential moving average
      
      this.processingLatencyByPriority[priority] = Math.round(newLatency);
      this.messageProcessingStartTimes.delete(messageId);
    }
  }

  /**
   * Gets the current processing latency by priority level
   * 
   * @returns The processing latency by priority level (in milliseconds)
   */
  getProcessingLatencyByPriority(): ProcessingLatencyByPriority {
    return { ...this.processingLatencyByPriority };
  }

  /**
   * Resets all metrics
   */
  resetMetrics(): void {
    this.initializeMetrics();
    this.messageProcessingStartTimes.clear();
  }
}
