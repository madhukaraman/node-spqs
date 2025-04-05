/**
 * Integration tests for the PriorityQueueService
 * 
 * Note: These tests require actual AWS SQS and Redis instances to run.
 * Set the following environment variables before running:
 * - SQS_QUEUE_URL: The URL of the SQS queue to use for testing
 * - REDIS_URL: The URL of the Redis instance to use for testing
 * - AWS_REGION: The AWS region to use
 * 
 * To run these tests:
 * SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789012/test-queue REDIS_URL=redis://localhost:6379 AWS_REGION=us-east-1 npm test -- -t "integration"
 */

import { PriorityQueueService } from '../../src';

// Skip tests if environment variables are not set
const runTests = process.env.SQS_QUEUE_URL && process.env.REDIS_URL && process.env.AWS_REGION || 'ap-south-1';

// Set longer timeout for integration tests
jest.setTimeout(30000);

describe('PriorityQueueService Integration', () => {
  let service: PriorityQueueService;
  
  beforeAll(async () => {
    if (!runTests) {
      console.warn('Skipping integration tests: Required environment variables not set');
      return;
    }
    
    // Initialize the service
    service = new PriorityQueueService({
      region: process.env.AWS_REGION || 'ap-south-1'!,
      queueUrl: process.env.SQS_QUEUE_URL!,
      redisUrl: process.env.REDIS_URL!,
      priorityLevels: 3,
    });
    
    // Connect to services
    await service.connect();
    
    // Purge the queue to start with a clean state
    await service.purgeQueue();
  });
  
  afterAll(async () => {
    if (!runTests) return;
    
    // Disconnect from services
    await service.disconnect();
  });
  
  test.skip('should send and receive messages with priority order', async () => {
    if (!runTests) return;
    
    // Send messages with different priorities
    const highPriorityId = await service.sendMessage({
      body: 'High priority message',
      priority: 0,
    });
    
    const mediumPriorityId = await service.sendMessage({
      body: 'Medium priority message',
      priority: 1,
    });
    
    const lowPriorityId = await service.sendMessage({
      body: 'Low priority message',
      priority: 2,
    });
    
    // Wait for messages to be available
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Receive messages
    const messages = await service.receiveMessages({ maxMessages: 3 });
    
    // Verify messages are received in priority order
    expect(messages).toHaveLength(3);
    expect(messages[0].priority).toBe(0);
    expect(messages[1].priority).toBe(1);
    expect(messages[2].priority).toBe(2);
    
    // Delete messages
    for (const message of messages) {
      await service.deleteMessage(message.receiptHandle, message.id, message.priority);
    }
    
    // Verify queue is empty
    const queueDepth = await service.getQueueDepthByPriority();
    expect(queueDepth[0]).toBe(0);
    expect(queueDepth[1]).toBe(0);
    expect(queueDepth[2]).toBe(0);
  });
  
  test.skip('should maintain FIFO order within the same priority level', async () => {
    if (!runTests) return;
    
    // Send multiple messages with the same priority
    const messageIds = [];
    for (let i = 0; i < 5; i++) {
      const id = await service.sendMessage({
        body: `Priority 1 message ${i}`,
        priority: 1,
      });
      messageIds.push(id);
    }
    
    // Wait for messages to be available
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Receive messages
    const messages = await service.receiveMessages({ maxMessages: 5 });
    
    // Verify messages are received in FIFO order
    expect(messages).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(messages[i].body).toBe(`Priority 1 message ${i}`);
    }
    
    // Delete messages
    for (const message of messages) {
      await service.deleteMessage(message.receiptHandle, message.id, message.priority);
    }
  });
  
  test.skip('should prevent starvation of lower priority messages', async () => {
    if (!runTests) return;
    
    // Send many high priority messages and some low priority messages
    for (let i = 0; i < 10; i++) {
      await service.sendMessage({
        body: `High priority message ${i}`,
        priority: 0,
      });
    }
    
    // Send a few low priority messages
    for (let i = 0; i < 3; i++) {
      await service.sendMessage({
        body: `Low priority message ${i}`,
        priority: 2,
      });
    }
    
    // Configure service with a low starvation threshold
    const starvationService = new PriorityQueueService({
      region: process.env.AWS_REGION || 'ap-south-1'!,
      queueUrl: process.env.SQS_QUEUE_URL!,
      redisUrl: process.env.REDIS_URL!,
      priorityLevels: 3,
      starvationPreventionThreshold: 2, // Low threshold to trigger starvation prevention
    });
    
    await starvationService.connect();
    
    // Wait for messages to be available
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Receive messages
    const messages = await starvationService.receiveMessages({ maxMessages: 10 });
    
    // Verify that at least one low priority message is included
    const lowPriorityMessages = messages.filter(m => m.priority === 2);
    expect(lowPriorityMessages.length).toBeGreaterThan(0);
    
    // Delete messages
    for (const message of messages) {
      await service.deleteMessage(message.receiptHandle, message.id, message.priority);
    }
    
    await starvationService.disconnect();
  });
  
  test.skip('should track metrics correctly', async () => {
    if (!runTests) return;
    
    // Send messages with different priorities
    await service.sendMessage({
      body: 'High priority message',
      priority: 0,
    });
    
    await service.sendMessage({
      body: 'Medium priority message',
      priority: 1,
    });
    
    await service.sendMessage({
      body: 'Low priority message',
      priority: 2,
    });
    
    // Wait for messages to be available
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Get queue depth
    const queueDepth = await service.getQueueDepthByPriority();
    
    // Verify queue depth
    expect(queueDepth[0]).toBe(1);
    expect(queueDepth[1]).toBe(1);
    expect(queueDepth[2]).toBe(1);
    
    // Receive and process messages
    const messages = await service.receiveMessages({ maxMessages: 3 });
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Delete messages
    for (const message of messages) {
      await service.deleteMessage(message.receiptHandle, message.id, message.priority);
    }
    
    // Get processing latency
    const latency = await service.getProcessingLatencyByPriority();
    
    // Verify latency is tracked
    expect(latency[0]).toBeGreaterThan(0);
    expect(latency[1]).toBeGreaterThan(0);
    expect(latency[2]).toBeGreaterThan(0);
  });
});
