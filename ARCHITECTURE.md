# Simple Priority Queue Service Architecture

## Overview

The Simple Priority Queue Service provides a priority-based message queue implementation on top of AWS SQS, using Redis for priority management. This document outlines the architecture and design decisions.

## Architecture Diagram

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│    Producer     │────▶│  Priority Queue │────▶│    Consumer     │
│    Application  │     │     Service     │     │    Application  │
│                 │     │                 │     │                 │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                                 │
                        ┌────────┴────────┐
                        │                 │
                        │   AWS SQS Queue │
                        │                 │
                        └────────┬────────┘
                                 │
                                 │
                        ┌────────┴────────┐
                        │                 │
                        │  Redis Cluster  │
                        │                 │
                        └─────────────────┘
```

## Components

### 1. Priority Queue Service

The core service that provides the priority queue functionality. It:

- Exposes methods for sending, receiving, and deleting messages with priority
- Manages the interaction between SQS and Redis
- Ensures messages are processed in priority order
- Prevents starvation of lower priority messages
- Collects metrics on queue depth and processing latency

### 2. AWS SQS Queue

A standard SQS queue that:

- Stores the actual message content
- Provides reliable message delivery
- Handles visibility timeout and message retention
- Supports dead letter queues for failed messages

### 3. Redis Cluster

A Redis instance that:

- Maintains sorted sets for each priority level
- Tracks message metadata including priority information
- Enables efficient priority-based message retrieval
- Stores metrics data

## Message Flow

### Sending a Message

1. Client calls `sendMessage()` with a message and priority
2. Message is sent to the SQS queue with priority as a message attribute
3. Message metadata is stored in Redis with the priority level
4. Message ID is added to the appropriate priority queue in Redis

### Receiving Messages

1. Client calls `receiveMessages()`
2. Service queries Redis to determine the next messages to process based on priority
3. Service receives messages from SQS
4. Messages are filtered and ordered based on priority information from Redis
5. Prioritized messages are returned to the client

### Deleting a Message

1. Client calls `deleteMessage()` after processing
2. Message is deleted from SQS
3. Message metadata and priority information are removed from Redis
4. Metrics are updated

## Priority Management

- Messages are organized into distinct priority levels (0 being highest)
- Within each priority level, FIFO ordering is maintained
- A starvation prevention mechanism ensures lower priority messages are eventually processed
- The starvation threshold is configurable

## Monitoring and Metrics

The service provides:

- Queue depth by priority level
- Processing latency by priority level
- Integration with CloudWatch for operational monitoring
- Dashboards for visualizing queue performance

## Deployment

The service can be deployed using:

- CloudFormation template (see `cloudformation.yaml`)
- Terraform configuration (see `terraform/` directory)

## Scaling Considerations

- Horizontal scaling is supported for both producers and consumers
- Redis can be scaled to handle increased metadata storage needs
- SQS automatically scales to handle message volume

## Fault Tolerance

- SQS provides message persistence and at-least-once delivery
- Redis is used for priority management, not message storage
- If Redis fails, the system degrades to standard SQS behavior
- Dead letter queues capture messages that fail processing
