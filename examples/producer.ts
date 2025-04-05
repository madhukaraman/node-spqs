import { PriorityQueueService, LogLevel } from '../src';

/**
 * Example producer that sends messages with different priorities
 */
async function runProducer() {
  // Initialize the service
  const queueService = new PriorityQueueService({
    region: process.env.AWS_REGION || 'ap-south-1',
    queueUrl: process.env.SQS_QUEUE_URL || 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue',
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    priorityLevels: 3, // 0, 1, 2 (0 being highest priority)
    awsConfig: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
  });

  // Set log level to debug for more verbose output
  queueService.setLogLevel(LogLevel.DEBUG);

  try {
    // Connect to services
    await queueService.connect();
    console.log('Connected to services');

    // Send high priority messages
    for (let i = 0; i < 5; i++) {
      const messageId = await queueService.sendMessage({
        body: `High priority message ${i}`,
        priority: 0,
        attributes: {
          Type: 'HighPriority',
          Timestamp: new Date().toISOString(),
        },
      });
      console.log(`Sent high priority message ${i} with ID ${messageId}`);
    }

    // Send medium priority messages
    for (let i = 0; i < 10; i++) {
      const messageId = await queueService.sendMessage({
        body: `Medium priority message ${i}`,
        priority: 1,
        attributes: {
          Type: 'MediumPriority',
          Timestamp: new Date().toISOString(),
        },
      });
      console.log(`Sent medium priority message ${i} with ID ${messageId}`);
    }

    // Send low priority messages
    for (let i = 0; i < 15; i++) {
      const messageId = await queueService.sendMessage({
        body: `Low priority message ${i}`,
        priority: 2,
        attributes: {
          Type: 'LowPriority',
          Timestamp: new Date().toISOString(),
        },
      });
      console.log(`Sent low priority message ${i} with ID ${messageId}`);
    }

    // Get queue depth by priority
    const queueDepth = await queueService.getQueueDepthByPriority();
    console.log('Queue depth by priority:', queueDepth);

  } catch (error) {
    console.error('Error in producer:', error);
  } finally {
    // Disconnect from services
    await queueService.disconnect();
    console.log('Disconnected from services');
  }
}

// Run the producer
runProducer().catch(console.error);
