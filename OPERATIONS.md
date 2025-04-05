# Simple Priority Queue Service Operations Guide

This document provides guidance for operating and maintaining the Simple Priority Queue Service in production environments.

## Prerequisites

- AWS account with appropriate permissions
- Redis instance (v4.x or higher)
- Node.js 14.x or higher

## Deployment

### Using CloudFormation

1. Navigate to the AWS CloudFormation console
2. Click "Create stack" and upload the `cloudformation.yaml` file
3. Specify stack parameters:
   - Environment: `dev`, `staging`, or `prod`
4. Review and create the stack
5. Note the outputs for SQS Queue URL and Redis endpoint

### Using Terraform

1. Navigate to the `terraform` directory
2. Initialize Terraform:
   ```
   terraform init
   ```
3. Plan the deployment:
   ```
   terraform plan -var="environment=dev"
   ```
4. Apply the configuration:
   ```
   terraform apply -var="environment=dev"
   ```
5. Note the outputs for SQS Queue URL and Redis endpoint

## Configuration

The service requires the following configuration:

- AWS Region
- SQS Queue URL
- Redis URL
- Number of priority levels (default: 3)
- Visibility timeout (default: 30 seconds)
- Wait time for long polling (default: 20 seconds)
- Starvation prevention threshold (default: 100 messages)

Example configuration:

```javascript
const queueService = new PriorityQueueService({
  region: process.env.AWS_REGION || 'ap-south-1',
  queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/priority-queue-dev',
  redisUrl: 'redis://redis-endpoint.amazonaws.com:6379',
  priorityLevels: 3,
  visibilityTimeout: 30,
  waitTimeSeconds: 20,
  starvationPreventionThreshold: 100,
});
```

## Monitoring

### CloudWatch Metrics

The following CloudWatch metrics should be monitored:

1. **SQS Metrics**
   - ApproximateNumberOfMessagesVisible
   - ApproximateNumberOfMessagesNotVisible
   - ApproximateAgeOfOldestMessage
   - NumberOfMessagesSent
   - NumberOfMessagesReceived
   - NumberOfMessagesDeleted

2. **Custom Metrics**
   - QueueDepthByPriority
   - ProcessingLatencyByPriority

### Dashboards

A CloudWatch dashboard is automatically created during deployment, providing visibility into:
- Queue depth
- Message operations
- Message age
- Dead letter queue status

### Alarms

Consider setting up the following alarms:

1. **High Queue Depth**
   - Trigger when ApproximateNumberOfMessagesVisible exceeds a threshold
   - Indicates potential processing bottleneck

2. **Message Age**
   - Trigger when ApproximateAgeOfOldestMessage exceeds a threshold
   - Indicates messages are not being processed in a timely manner

3. **Dead Letter Queue**
   - Trigger when messages appear in the DLQ
   - Indicates processing failures

4. **Priority Imbalance**
   - Trigger when low priority queue depth is significantly higher than high priority
   - May indicate starvation of low priority messages

## Troubleshooting

### Common Issues

1. **Messages not being processed in priority order**
   - Verify Redis connection is working
   - Check that message priorities are being set correctly
   - Ensure consumers are using the PriorityQueueService for receiving messages

2. **High message latency**
   - Check consumer scaling and throughput
   - Verify visibility timeout is appropriate for processing time
   - Look for bottlenecks in message processing logic

3. **Redis connection failures**
   - Check network connectivity
   - Verify security group settings
   - Ensure Redis instance is healthy

4. **SQS throttling**
   - Implement exponential backoff for API calls
   - Consider requesting a quota increase if consistently hitting limits

### Debugging

1. **Enable Debug Logging**
   ```javascript
   queueService.setLogLevel(LogLevel.DEBUG);
   ```

2. **Check Queue Metrics**
   ```javascript
   const queueDepth = await queueService.getQueueDepthByPriority();
   console.log('Queue depth by priority:', queueDepth);
   
   const latency = await queueService.getProcessingLatencyByPriority();
   console.log('Processing latency by priority (ms):', latency);
   ```

3. **Inspect Dead Letter Queue**
   - Check messages in the DLQ for error patterns
   - Reprocess messages if appropriate

## Maintenance

### Scaling

1. **Producer Scaling**
   - Producers can be scaled horizontally without special considerations
   - SQS automatically handles increased send volume

2. **Consumer Scaling**
   - Consumers can be scaled horizontally
   - Be aware that more consumers means more Redis connections
   - Ensure Redis can handle the connection load

3. **Redis Scaling**
   - Monitor Redis memory usage and CPU
   - Consider upgrading to a larger instance if approaching limits
   - For very high throughput, consider Redis Cluster

### Backup and Recovery

1. **SQS**
   - SQS automatically replicates messages across multiple AZs
   - No manual backup is required

2. **Redis**
   - Enable Redis backup/snapshot feature
   - Consider Redis replication for high availability
   - Test recovery procedures regularly

### Upgrades

1. **Library Upgrades**
   - Test new versions in a staging environment
   - Follow semantic versioning for backward compatibility
   - Review release notes for breaking changes

2. **Infrastructure Upgrades**
   - Use infrastructure as code to manage changes
   - Apply changes to staging before production
   - Have a rollback plan

## Performance Tuning

1. **Visibility Timeout**
   - Set to slightly longer than your average processing time
   - Too short: Messages may be processed multiple times
   - Too long: Failed processing delays redelivery

2. **Batch Size**
   - Adjust maxMessages parameter when receiving messages
   - Larger batches improve throughput but increase processing time

3. **Starvation Prevention**
   - Tune starvationPreventionThreshold based on message volume
   - Lower values ensure faster processing of lower priorities
   - Higher values prioritize high-priority messages more strictly

4. **Redis Connection Pooling**
   - For high-throughput applications, consider implementing connection pooling

## Security

1. **Access Control**
   - Use IAM roles with least privilege
   - Restrict SQS and Redis access to necessary services

2. **Data Protection**
   - Consider encrypting sensitive message data
   - Use VPC for Redis to isolate network traffic

3. **Audit Logging**
   - Enable CloudTrail for API activity monitoring
   - Log access to SQS and Redis resources
