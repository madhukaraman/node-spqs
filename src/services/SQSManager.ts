import AWS from 'aws-sdk';
import { SendMessageParams, ReceiveMessageParams } from '../types';
import { DEFAULT_CONFIG } from '../config';
import { Logger, LogLevel } from '../utils/logger';

/**
 * Manages AWS SQS operations for the priority queue service
 */
export class SQSManager {
  private sqs: AWS.SQS;
  private queueUrl: string;
  private visibilityTimeout: number;
  private waitTimeSeconds: number;
  private logger: Logger;

  /**
   * Creates a new SQS manager
   * 
   * @param region - The AWS region
   * @param queueUrl - The SQS queue URL
   * @param visibilityTimeout - The visibility timeout in seconds
   * @param waitTimeSeconds - The wait time for long polling in seconds
   * @param awsConfig - Optional AWS SDK configuration
   */
  constructor(
    region: string,
    queueUrl: string,
    visibilityTimeout: number = DEFAULT_CONFIG.VISIBILITY_TIMEOUT,
    waitTimeSeconds: number = DEFAULT_CONFIG.WAIT_TIME_SECONDS,
    awsConfig?: AWS.SQS.ClientConfiguration
  ) {
    this.queueUrl = queueUrl;
    this.visibilityTimeout = visibilityTimeout;
    this.waitTimeSeconds = waitTimeSeconds;
    this.logger = new Logger('SQSManager');

    // Initialize AWS SDK
    const config: AWS.SQS.ClientConfiguration = {
      region,
      ...awsConfig
    };

    this.sqs = new AWS.SQS(config);
  }

  /**
   * Sends a message to the SQS queue
   * 
   * @param params - The message parameters
   * @returns The message ID
   */
  async sendMessage(params: SendMessageParams): Promise<string> {
    try {
      const { body, attributes, messageGroupId, messageDeduplicationId, delaySeconds } = params;
      
      // Prepare message attributes
      const messageAttributes: AWS.SQS.MessageBodyAttributeMap = {};
      
      // Add priority as a message attribute
      messageAttributes['Priority'] = {
        DataType: 'Number',
        StringValue: params.priority.toString()
      };
      
      // Add custom attributes
      if (attributes) {
        Object.entries(attributes).forEach(([key, value]) => {
          messageAttributes[key] = {
            DataType: 'String',
            StringValue: value
          };
        });
      }
      
      // Prepare SQS parameters
      const sqsParams: AWS.SQS.SendMessageRequest = {
        QueueUrl: this.queueUrl,
        MessageBody: body,
        MessageAttributes: messageAttributes,
        DelaySeconds: delaySeconds
      };
      
      // Add FIFO queue parameters if provided
      if (messageGroupId) {
        sqsParams.MessageGroupId = messageGroupId;
      }
      
      if (messageDeduplicationId) {
        sqsParams.MessageDeduplicationId = messageDeduplicationId;
      }
      
      // Send the message
      const result = await this.sqs.sendMessage(sqsParams).promise();
      
      this.logger.debug(`Sent message to SQS with ID ${result.MessageId}`);
      
      return result.MessageId || '';
    } catch (error) {
      this.logger.error('Failed to send message to SQS', error);
      throw error;
    }
  }

  /**
   * Receives messages from the SQS queue
   * 
   * @param params - The receive parameters
   * @returns Array of SQS messages
   */
  async receiveMessages(params?: ReceiveMessageParams): Promise<AWS.SQS.Message[]> {
    try {
      const maxMessages = params?.maxMessages || DEFAULT_CONFIG.MAX_MESSAGES;
      const visibilityTimeout = params?.visibilityTimeout || this.visibilityTimeout;
      const waitTimeSeconds = params?.waitTimeSeconds || this.waitTimeSeconds;
      const includeAttributes = params?.includeAttributes !== undefined ? params.includeAttributes : true;
      
      const sqsParams: AWS.SQS.ReceiveMessageRequest = {
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: maxMessages,
        VisibilityTimeout: visibilityTimeout,
        WaitTimeSeconds: waitTimeSeconds,
        MessageAttributeNames: includeAttributes ? ['All'] : [],
        AttributeNames: includeAttributes ? ['All'] : []
      };
      
      const result = await this.sqs.receiveMessage(sqsParams).promise();
      
      const messages = result.Messages || [];
      this.logger.debug(`Received ${messages.length} messages from SQS`);
      
      return messages;
    } catch (error) {
      this.logger.error('Failed to receive messages from SQS', error);
      throw error;
    }
  }

  /**
   * Deletes a message from the SQS queue
   * 
   * @param receiptHandle - The receipt handle of the message to delete
   */
  async deleteMessage(receiptHandle: string): Promise<void> {
    try {
      const params: AWS.SQS.DeleteMessageRequest = {
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle
      };
      
      await this.sqs.deleteMessage(params).promise();
      
      this.logger.debug('Deleted message from SQS');
    } catch (error) {
      this.logger.error('Failed to delete message from SQS', error);
      throw error;
    }
  }

  /**
   * Changes the visibility timeout of a message
   * 
   * @param receiptHandle - The receipt handle of the message
   * @param visibilityTimeout - The new visibility timeout in seconds
   */
  async changeMessageVisibility(receiptHandle: string, visibilityTimeout: number): Promise<void> {
    try {
      const params: AWS.SQS.ChangeMessageVisibilityRequest = {
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: visibilityTimeout
      };
      
      await this.sqs.changeMessageVisibility(params).promise();
      
      this.logger.debug(`Changed message visibility timeout to ${visibilityTimeout} seconds`);
    } catch (error) {
      this.logger.error('Failed to change message visibility', error);
      throw error;
    }
  }

  /**
   * Gets the approximate number of messages in the queue
   * 
   * @returns The approximate number of messages
   */
  async getApproximateNumberOfMessages(): Promise<number> {
    try {
      const params: AWS.SQS.GetQueueAttributesRequest = {
        QueueUrl: this.queueUrl,
        AttributeNames: ['ApproximateNumberOfMessages']
      };
      
      const result = await this.sqs.getQueueAttributes(params).promise();
      
      return parseInt(result.Attributes?.ApproximateNumberOfMessages || '0', 10);
    } catch (error) {
      this.logger.error('Failed to get approximate number of messages', error);
      throw error;
    }
  }

  /**
   * Purges the SQS queue
   */
  async purgeQueue(): Promise<void> {
    try {
      const params: AWS.SQS.PurgeQueueRequest = {
        QueueUrl: this.queueUrl
      };
      
      await this.sqs.purgeQueue(params).promise();
      
      this.logger.info('Purged SQS queue');
    } catch (error) {
      this.logger.error('Failed to purge SQS queue', error);
      throw error;
    }
  }
}
