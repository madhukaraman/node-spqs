# Simple Priority Queue Service for AWS SQS

A Node.js library that provides a priority queue implementation on top of AWS SQS, using Redis for priority management.

## Features

- Priority-based message processing with at least 3 distinct priority levels (0 being highest)
- FIFO ordering within the same priority level
- Standard SQS message operations (send, receive, delete)
- Dynamic priority assignment at message creation time
- Prevention of starvation for lower-priority messages
- Metrics for queue depth and processing latency by priority level

## Installation

```bash
npm install @mnmadhukar/node-spqs
# or
yarn add @mnmadhukar/node-spqs
# or
pnpm add @mnmadhukar/node-spqs

```

## Requirements

- Node.js 14.x or higher
- AWS account with SQS access
- Redis server (v4.x or higher)

## Usage

### Basic Setup

```typescript
import { PriorityQueueService } from 'simple-priority-queue-service';

// Initialize the service
const queueService = new PriorityQueueService({
  region: process.env.AWS_REGION || 'ap-south-1',
  queueUrl: 'https://sqs.ap-south-1.amazonaws.com/123456789012/my-queue',
  redisUrl: 'redis://localhost:6379',
  priorityLevels: 3, // 0, 1, 2 (0 being highest priority)
});

// Connect to services
await queueService.connect();
```

### Sending Messages

```typescript
// Send a message with priority
await queueService.sendMessage({
  body: 'Hello, world!',
  priority: 0, // High priority
});

// Send a message with medium priority
await queueService.sendMessage({
  body: 'Less urgent message',
  priority: 1, // Medium priority
});

// Send a message with low priority
await queueService.sendMessage({
  body: 'Low priority message',
  priority: 2, // Low priority
});
```

### Receiving Messages

```typescript
// Receive messages (automatically prioritized)
const messages = await queueService.receiveMessages({
  maxMessages: 10,
});

// Process messages
for (const message of messages) {
  console.log(`Processing message with priority ${message.priority}: ${message.body}`);
  
  // After processing, delete the message
  await queueService.deleteMessage(message.receiptHandle);
}
```

### Cleanup

```typescript
// Disconnect when done
await queueService.disconnect();
```

## Advanced Configuration

```typescript
const queueService = new PriorityQueueService({
  region: process.env.AWS_REGION || 'ap-south-1',
  queueUrl: 'https://sqs.ap-south-1.amazonaws.com/123456789012/my-queue',
  redisUrl: 'redis://localhost:6379',
  priorityLevels: 5, // 0, 1, 2, 3, 4
  
  // Advanced options
  visibilityTimeout: 30, // seconds
  waitTimeSeconds: 20, // for long polling
  starvationPreventionThreshold: 100, // Process lower priority after this many messages
  
  // AWS SDK options
  awsConfig: {
    accessKeyId: 'YOUR_ACCESS_KEY',
    secretAccessKey: 'YOUR_SECRET_KEY',
  },
});
```

## Monitoring

The service provides built-in metrics that can be accessed:

```typescript
// Get queue depth by priority
const queueDepth = await queueService.getQueueDepthByPriority();
console.log(queueDepth); // { 0: 5, 1: 10, 2: 20 }

// Get processing latency by priority
const latency = await queueService.getProcessingLatencyByPriority();
console.log(latency); // { 0: 120, 1: 350, 2: 780 } (in ms)
```

## Architecture

This library uses:
- AWS SQS for reliable message storage and delivery
- Redis for tracking message priorities and ensuring priority-based processing
- A single SQS queue with Redis-based priority management (no multiple queues)

## License

MIT
