import { PriorityQueueService, LogLevel } from '../src';
import AWS from 'aws-sdk';

/**
 * This example demonstrates how to use the Priority Queue Service with local Redis
 * and LocalStack for SQS testing.
 */

// LocalStack endpoint URL
const LOCALSTACK_ENDPOINT = 'http://localhost:4566';

// Queue name for testing
const QUEUE_NAME = 'priority-queue-test';

/**
 * Creates an SQS queue in LocalStack
 */
async function createQueue(): Promise<string> {
  // Configure AWS SDK to use LocalStack
  const sqs = new AWS.SQS({
    endpoint: LOCALSTACK_ENDPOINT,
    region: 'us-east-1',
    credentials: new AWS.Credentials({
      accessKeyId: 'test',
      secretAccessKey: 'test',
    }),
  });

  // Create the queue
  console.log(`Creating queue ${QUEUE_NAME} in LocalStack...`);
  const result = await sqs.createQueue({
    QueueName: QUEUE_NAME,
  }).promise();

  if (!result.QueueUrl) {
    throw new Error('Failed to create queue');
  }

  console.log(`Queue created: ${result.QueueUrl}`);
  return result.QueueUrl;
}

/**
 * Runs the test with LocalStack
 */
async function runLocalStackTest() {
  try {
    // Create the queue in LocalStack
    const queueUrl = await createQueue();

    // Initialize the service with local Redis and LocalStack SQS
    const queueService = new PriorityQueueService({
      region: 'us-east-1',
      queueUrl,
      redisUrl: 'redis://localhost:6379', // Use your local Redis
      priorityLevels: 3,
      // Configure AWS SDK to use LocalStack
      awsConfig: {
        endpoint: LOCALSTACK_ENDPOINT,
        credentials: {
          accessKeyId: 'test',
          secretAccessKey: 'test',
        },
      },
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

    // SQS only allows receiving a maximum of 10 messages at a time
    // So we'll make multiple calls to get all our messages
    let allMessages = [];

    // First batch (max 10)
    console.log('Receiving first batch of messages (max 10)...');
    const firstBatch = await queueService.receiveMessages({ maxMessages: 10 });
    allMessages.push(...firstBatch);

    // Second batch (remaining messages)
    console.log('Receiving second batch of messages (max 10)...');
    const secondBatch = await queueService.receiveMessages({ maxMessages: 10 });
    allMessages.push(...secondBatch);

    const messages = allMessages;

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
    console.error('Error in LocalStack test:', error);
  }
}

// Run the LocalStack test
runLocalStackTest().catch(console.error);
