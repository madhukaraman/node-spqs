import { SQSManager } from '../../src/services/SQSManager';
import AWS from 'aws-sdk';

// Mock AWS SDK
jest.mock('aws-sdk', () => {
  const mockSendMessage = jest.fn().mockReturnValue({
    promise: jest.fn().mockResolvedValue({ MessageId: 'test-message-id' }),
  });
  
  const mockReceiveMessage = jest.fn().mockReturnValue({
    promise: jest.fn().mockResolvedValue({
      Messages: [
        {
          MessageId: 'test-message-id',
          Body: 'Test message body',
          ReceiptHandle: 'test-receipt-handle',
          MessageAttributes: {
            'Priority': {
              StringValue: '0',
              DataType: 'Number',
            },
          },
        },
      ],
    }),
  });
  
  const mockDeleteMessage = jest.fn().mockReturnValue({
    promise: jest.fn().mockResolvedValue({}),
  });
  
  const mockChangeMessageVisibility = jest.fn().mockReturnValue({
    promise: jest.fn().mockResolvedValue({}),
  });
  
  const mockGetQueueAttributes = jest.fn().mockReturnValue({
    promise: jest.fn().mockResolvedValue({
      Attributes: {
        ApproximateNumberOfMessages: '10',
      },
    }),
  });
  
  const mockPurgeQueue = jest.fn().mockReturnValue({
    promise: jest.fn().mockResolvedValue({}),
  });
  
  return {
    SQS: jest.fn().mockImplementation(() => ({
      sendMessage: mockSendMessage,
      receiveMessage: mockReceiveMessage,
      deleteMessage: mockDeleteMessage,
      changeMessageVisibility: mockChangeMessageVisibility,
      getQueueAttributes: mockGetQueueAttributes,
      purgeQueue: mockPurgeQueue,
    })),
  };
});

describe('SQSManager', () => {
  let sqsManager: SQSManager;
  let mockSQS: any;
  
  const queueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789012/test-queue';
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    sqsManager = new SQSManager(process.env.AWS_REGION || 'ap-south-1', queueUrl);
    mockSQS = new AWS.SQS();
  });
  
  describe('sendMessage', () => {
    it('should send a message to SQS', async () => {
      // Arrange
      const message = {
        body: 'Test message',
        priority: 0,
        attributes: {
          test: 'value',
        },
      };
      
      // Act
      const result = await sqsManager.sendMessage(message);
      
      // Assert
      expect(result).toBe('test-message-id');
      expect(mockSQS.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        QueueUrl: queueUrl,
        MessageBody: 'Test message',
        MessageAttributes: expect.objectContaining({
          'Priority': {
            DataType: 'Number',
            StringValue: '0',
          },
          'test': {
            DataType: 'String',
            StringValue: 'value',
          },
        }),
      }));
    });
    
    it('should include FIFO queue parameters when provided', async () => {
      // Arrange
      const message = {
        body: 'Test message',
        priority: 0,
        messageGroupId: 'group1',
        messageDeduplicationId: 'dedup1',
      };
      
      // Act
      await sqsManager.sendMessage(message);
      
      // Assert
      expect(mockSQS.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        MessageGroupId: 'group1',
        MessageDeduplicationId: 'dedup1',
      }));
    });
    
    it('should include delay seconds when provided', async () => {
      // Arrange
      const message = {
        body: 'Test message',
        priority: 0,
        delaySeconds: 30,
      };
      
      // Act
      await sqsManager.sendMessage(message);
      
      // Assert
      expect(mockSQS.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        DelaySeconds: 30,
      }));
    });
  });
  
  describe('receiveMessages', () => {
    it('should receive messages from SQS with default parameters', async () => {
      // Act
      const result = await sqsManager.receiveMessages();
      
      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].MessageId).toBe('test-message-id');
      expect(mockSQS.receiveMessage).toHaveBeenCalledWith(expect.objectContaining({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
        VisibilityTimeout: 30,
        WaitTimeSeconds: 20,
        MessageAttributeNames: ['All'],
        AttributeNames: ['All'],
      }));
    });
    
    it('should use custom parameters when provided', async () => {
      // Arrange
      const params = {
        maxMessages: 5,
        visibilityTimeout: 60,
        waitTimeSeconds: 10,
        includeAttributes: false,
      };
      
      // Act
      await sqsManager.receiveMessages(params);
      
      // Assert
      expect(mockSQS.receiveMessage).toHaveBeenCalledWith(expect.objectContaining({
        MaxNumberOfMessages: 5,
        VisibilityTimeout: 60,
        WaitTimeSeconds: 10,
        MessageAttributeNames: [],
        AttributeNames: [],
      }));
    });
  });
  
  describe('deleteMessage', () => {
    it('should delete a message from SQS', async () => {
      // Act
      await sqsManager.deleteMessage('test-receipt-handle');
      
      // Assert
      expect(mockSQS.deleteMessage).toHaveBeenCalledWith({
        QueueUrl: queueUrl,
        ReceiptHandle: 'test-receipt-handle',
      });
    });
  });
  
  describe('changeMessageVisibility', () => {
    it('should change message visibility timeout', async () => {
      // Act
      await sqsManager.changeMessageVisibility('test-receipt-handle', 60);
      
      // Assert
      expect(mockSQS.changeMessageVisibility).toHaveBeenCalledWith({
        QueueUrl: queueUrl,
        ReceiptHandle: 'test-receipt-handle',
        VisibilityTimeout: 60,
      });
    });
  });
  
  describe('getApproximateNumberOfMessages', () => {
    it('should get the approximate number of messages', async () => {
      // Act
      const result = await sqsManager.getApproximateNumberOfMessages();
      
      // Assert
      expect(result).toBe(10);
      expect(mockSQS.getQueueAttributes).toHaveBeenCalledWith({
        QueueUrl: queueUrl,
        AttributeNames: ['ApproximateNumberOfMessages'],
      });
    });
  });
  
  describe('purgeQueue', () => {
    it('should purge the queue', async () => {
      // Act
      await sqsManager.purgeQueue();
      
      // Assert
      expect(mockSQS.purgeQueue).toHaveBeenCalledWith({
        QueueUrl: queueUrl,
      });
    });
  });
});
