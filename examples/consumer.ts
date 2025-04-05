import { PriorityQueueService, LogLevel, PriorityMessage } from '../src';

/**
 * Example consumer that processes messages in priority order
 */
async function runConsumer() {
  // Initialize the service
  const queueService = new PriorityQueueService({
    region: process.env.AWS_REGION || 'ap-south-1',
    queueUrl: process.env.SQS_QUEUE_URL || 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue',
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    priorityLevels: 3, // 0, 1, 2 (0 being highest priority)
    visibilityTimeout: 30,
    waitTimeSeconds: 20,
    starvationPreventionThreshold: 100,
    awsConfig: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  // Set log level to debug for more verbose output
  queueService.setLogLevel(LogLevel.DEBUG);

  try {
    // Connect to services
    await queueService.connect();
    console.log('Connected to services');

    // Process messages in a loop
    console.log('Starting to process messages...');
    
    let running = true;
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('Shutting down...');
      running = false;
    });

    while (running) {
      // Receive messages (automatically prioritized)
      const messages = await queueService.receiveMessages({
        maxMessages: 10,
        waitTimeSeconds: 20,
      });

      if (messages.length === 0) {
        // console.log('No messages received, waiting...');
        continue;
      }

      console.log(`Received ${messages.length} messages`);

      // Process messages
      for (const message of messages) {
        await processMessage(message);
        
        // After processing, delete the message
        await queueService.deleteMessage(
          message.receiptHandle,
          message.id,
          message.priority
        );
        
        console.log(`Deleted message ${message.id}`);
      }

      // Get metrics
      const queueDepth = await queueService.getQueueDepthByPriority();
      console.log('Queue depth by priority:', queueDepth);
      
      const latency = await queueService.getProcessingLatencyByPriority();
      console.log('Processing latency by priority (ms):', latency);
    }

  } catch (error) {
    console.error('Error in consumer:', error);
  } finally {
    // Disconnect from services
    await queueService.disconnect();
    console.log('Disconnected from services');
  }
}

/**
 * Process a single message
 * 
 * @param message - The message to process
 */
async function processMessage(message: PriorityMessage): Promise<void> {
  console.log(`Processing message with priority ${message.priority}: ${message.body}`);
  
  // Simulate processing time based on priority
  // Higher priority messages are processed faster
  const processingTime = message.priority === 0 ? 100 : 
                         message.priority === 1 ? 300 : 
                         500;
  
  await new Promise(resolve => setTimeout(resolve, processingTime));
  
  console.log(`Finished processing message ${message.id}`);
}

// Run the consumer
runConsumer().catch(console.error);
