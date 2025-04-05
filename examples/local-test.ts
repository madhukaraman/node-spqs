import { PriorityQueueService, LogLevel } from '../src';
import { SQSManager } from '../src/services/SQSManager';

/**
 * This example demonstrates how to use the Priority Queue Service with local Redis
 * and a mock SQS implementation for testing purposes.
 */

// Mock SQS implementation that extends the real SQSManager
class MockSQSManager extends SQSManager {
  private messages: Map<string, any> = new Map();
  private messageIdCounter = 1;

  constructor() {
    // Call the parent constructor with dummy values
    super('us-east-1', 'http://localhost:9999/queue');
    console.log('Created MockSQSManager');
  }

  async sendMessage(params: any): Promise<string> {
    const messageId = `mock-msg-${this.messageIdCounter++}`;
    this.messages.set(messageId, {
      MessageId: messageId,
      Body: params.body,
      ReceiptHandle: `receipt-${messageId}`,
      MessageAttributes: {
        'Priority': {
          StringValue: params.priority.toString(),
          DataType: 'Number',
        },
        ...(params.attributes ? Object.entries(params.attributes).reduce((acc, [key, value]) => {
          acc[key] = {
            StringValue: value,
            DataType: 'String',
          };
          return acc;
        }, {} as any) : {}),
      },
    });

    console.log(`[MockSQS] Sent message with ID ${messageId}`);
    return messageId;
  }

  async receiveMessages(params?: any): Promise<any[]> {
    // Return all messages for simplicity
    const result = Array.from(this.messages.values());
    console.log(`[MockSQS] Received ${result.length} messages`);
    return result;
  }

  async deleteMessage(receiptHandle: string): Promise<void> {
    // Find the message with this receipt handle
    for (const [messageId, message] of this.messages.entries()) {
      if (message.ReceiptHandle === receiptHandle) {
        this.messages.delete(messageId);
        console.log(`[MockSQS] Deleted message with ID ${messageId}`);
        return;
      }
    }
  }

  async getApproximateNumberOfMessages(): Promise<number> {
    return this.messages.size;
  }

  async purgeQueue(): Promise<void> {
    this.messages.clear();
    console.log('[MockSQS] Queue purged');
  }
}

// Create a modified version of PriorityQueueService that uses our mock SQS manager
class MockPriorityQueueService extends PriorityQueueService {
  constructor(options: any) {
    super(options);

    // Replace the SQS manager with our mock
    (this as any).sqsManager = new MockSQSManager();
  }
}

async function runLocalTest() {
  try {
    // Initialize the service with local Redis and mock SQS
    const queueService = new MockPriorityQueueService({
      region: 'us-east-1', // Not used with mock SQS
      queueUrl: 'mock-queue-url', // Not used with mock SQS
      redisUrl: 'redis://localhost:6379', // Use your local Redis
      priorityLevels: 3,
    });

    // Set log level to debug for more verbose output
    queueService.setLogLevel(LogLevel.DEBUG);

    // Connect to services
    console.log('Connecting to services...');
    await queueService.connect();
    console.log('Connected to services');

    // Send messages with different priorities in random order
    console.log('\nSending messages in random order...');

    // Prepare messages of different priorities
    const messagesToSend = [
      // High priority messages (priority 0)
      ...Array(3).fill(0).map((_, i) => ({
        body: `High priority message ${i}`,
        priority: 0,
        type: 'HighPriority',
        index: i
      })),

      // Medium priority messages (priority 1)
      ...Array(5).fill(0).map((_, i) => ({
        body: `Medium priority message ${i}`,
        priority: 1,
        type: 'MediumPriority',
        index: i
      })),

      // Low priority messages (priority 2)
      ...Array(7).fill(0).map((_, i) => ({
        body: `Low priority message ${i}`,
        priority: 2,
        type: 'LowPriority',
        index: i
      }))
    ];

    // Shuffle the messages to send them in random order
    for (let i = messagesToSend.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [messagesToSend[i], messagesToSend[j]] = [messagesToSend[j], messagesToSend[i]];
    }

    // Send the messages in random order
    for (const msg of messagesToSend) {
      const messageId = await queueService.sendMessage({
        body: msg.body,
        priority: msg.priority,
        attributes: {
          Type: msg.type,
          Timestamp: new Date().toISOString(),
        },
      });
      console.log(`Sent ${msg.type} message ${msg.index} with priority ${msg.priority} and ID ${messageId}`);
    }

    // Get queue depth by priority
    const queueDepth = await queueService.getQueueDepthByPriority();
    console.log('\nQueue depth by priority:', queueDepth);

    // Receive messages (should be in priority order regardless of send order)
    console.log('\nReceiving messages...');
    console.log('Note: Messages should be returned in priority order (0, 1, 2) regardless of the random order they were sent');
    const messages = await queueService.receiveMessages({ maxMessages: 15 });

    console.log(`\nReceived ${messages.length} messages in priority order:`);

    // Group messages by priority for clearer output
    const messagesByPriority: { [key: number]: any[] } = {
      0: messages.filter(m => m.priority === 0),
      1: messages.filter(m => m.priority === 1),
      2: messages.filter(m => m.priority === 2)
    };

    // Display and process messages by priority group
    for (let priority = 0; priority <= 2; priority++) {
      const priorityMessages = messagesByPriority[priority];
      console.log(`\n== PRIORITY ${priority} MESSAGES (${priorityMessages.length}) ==`);

      for (const message of priorityMessages) {
        console.log(`- ${message.body}`);

        // Delete the message
        await queueService.deleteMessage(message.receiptHandle, message.id, message.priority);
        console.log(`  Deleted message ${message.id}`);
      }
    }

    // Get updated queue depth
    const updatedQueueDepth = await queueService.getQueueDepthByPriority();
    console.log('\nUpdated queue depth by priority:', updatedQueueDepth);

    // Disconnect from services
    await queueService.disconnect();
    console.log('\nDisconnected from services');

  } catch (error) {
    console.error('Error in local test:', error);
  }
}

// Run the local test
runLocalTest().catch(console.error);
