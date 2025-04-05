import { PriorityQueueService } from '../../src';
import { SQSManager } from '../../src/services/SQSManager';
import { RedisManager } from '../../src/services/RedisManager';

// Mock the SQSManager and RedisManager
jest.mock('../../src/services/SQSManager');
jest.mock('../../src/services/RedisManager');

describe('PriorityQueueService', () => {
  let service: PriorityQueueService;
  
  const mockOptions = {
    region: process.env.AWS_REGION || 'ap-south-1',
    queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/test-queue',
    redisUrl: 'redis://localhost:6379',
    priorityLevels: 3,
  };
  
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Create a new service instance
    service = new PriorityQueueService(mockOptions);
  });
  
  describe('connect', () => {
    it('should connect to Redis', async () => {
      // Arrange
      const redisConnectSpy = jest.spyOn(RedisManager.prototype, 'connect');
      
      // Act
      await service.connect();
      
      // Assert
      expect(redisConnectSpy).toHaveBeenCalledTimes(1);
    });
    
    it('should throw an error if Redis connection fails', async () => {
      // Arrange
      jest.spyOn(RedisManager.prototype, 'connect').mockRejectedValueOnce(new Error('Connection failed'));
      
      // Act & Assert
      await expect(service.connect()).rejects.toThrow('Connection failed');
    });
  });
  
  describe('disconnect', () => {
    it('should disconnect from Redis', async () => {
      // Arrange
      const redisDisconnectSpy = jest.spyOn(RedisManager.prototype, 'disconnect');
      
      // Act
      await service.disconnect();
      
      // Assert
      expect(redisDisconnectSpy).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('sendMessage', () => {
    it('should send a message with valid priority', async () => {
      // Arrange
      const messageId = 'test-message-id';
      const sqsSendMessageSpy = jest.spyOn(SQSManager.prototype, 'sendMessage')
        .mockResolvedValueOnce(messageId);
      const redisAddMessageSpy = jest.spyOn(RedisManager.prototype, 'addMessage')
        .mockResolvedValueOnce();
      const redisGetQueueDepthSpy = jest.spyOn(RedisManager.prototype, 'getQueueDepthByPriority')
        .mockResolvedValueOnce({ 0: 1, 1: 2, 2: 3 });
      
      const message = {
        body: 'Test message',
        priority: 0,
        attributes: { test: 'value' },
      };
      
      // Act
      const result = await service.sendMessage(message);
      
      // Assert
      expect(result).toBe(messageId);
      expect(sqsSendMessageSpy).toHaveBeenCalledWith(message);
      expect(redisAddMessageSpy).toHaveBeenCalledWith(
        messageId,
        0,
        expect.objectContaining({
          id: messageId,
          priority: 0,
          sentAt: expect.any(Number),
          receiveCount: 0,
        })
      );
      expect(redisGetQueueDepthSpy).toHaveBeenCalledTimes(1);
    });
    
    it('should throw an error for invalid priority', async () => {
      // Arrange
      const message = {
        body: 'Test message',
        priority: 5, // Invalid priority (out of range)
        attributes: { test: 'value' },
      };
      
      // Act & Assert
      await expect(service.sendMessage(message)).rejects.toThrow('Invalid priority: 5');
    });
  });
  
  describe('receiveMessages', () => {
    it('should receive and prioritize messages', async () => {
      // Arrange
      const messageIds = ['id1', 'id2'];
      const redisGetNextMessagesSpy = jest.spyOn(RedisManager.prototype, 'getNextMessages')
        .mockResolvedValueOnce(messageIds);
      
      const sqsMessages = [
        {
          MessageId: 'id1',
          Body: 'Message 1',
          ReceiptHandle: 'receipt1',
          MessageAttributes: {
            'Priority': {
              StringValue: '0',
              DataType: 'Number',
            },
          },
        },
        {
          MessageId: 'id2',
          Body: 'Message 2',
          ReceiptHandle: 'receipt2',
          MessageAttributes: {
            'Priority': {
              StringValue: '1',
              DataType: 'Number',
            },
          },
        },
      ];
      
      const sqsReceiveMessagesSpy = jest.spyOn(SQSManager.prototype, 'receiveMessages')
        .mockResolvedValueOnce(sqsMessages);
      
      const metadata1 = {
        id: 'id1',
        priority: 0,
        sentAt: Date.now(),
        receiveCount: 0,
      };
      
      const metadata2 = {
        id: 'id2',
        priority: 1,
        sentAt: Date.now(),
        receiveCount: 0,
      };
      
      const redisGetMetadataSpy = jest.spyOn(RedisManager.prototype, 'getMessageMetadata')
        .mockResolvedValueOnce(metadata1)
        .mockResolvedValueOnce(metadata2);
      
      const redisMarkReceivedSpy = jest.spyOn(RedisManager.prototype, 'markMessageAsReceived')
        .mockResolvedValue();
      
      const redisGetQueueDepthSpy = jest.spyOn(RedisManager.prototype, 'getQueueDepthByPriority')
        .mockResolvedValueOnce({ 0: 1, 1: 2, 2: 3 });
      
      // Act
      const result = await service.receiveMessages({ maxMessages: 10 });
      
      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('id1');
      expect(result[0].priority).toBe(0);
      expect(result[1].id).toBe('id2');
      expect(result[1].priority).toBe(1);
      
      expect(redisGetNextMessagesSpy).toHaveBeenCalledWith(10, expect.any(Number));
      expect(sqsReceiveMessagesSpy).toHaveBeenCalledWith(expect.objectContaining({ maxMessages: 10 }));
      expect(redisGetMetadataSpy).toHaveBeenCalledTimes(2);
      expect(redisMarkReceivedSpy).toHaveBeenCalledTimes(2);
      expect(redisGetQueueDepthSpy).toHaveBeenCalledTimes(1);
    });
    
    it('should return empty array when no messages are available', async () => {
      // Arrange
      jest.spyOn(RedisManager.prototype, 'getNextMessages')
        .mockResolvedValueOnce([]);
      
      // Act
      const result = await service.receiveMessages();
      
      // Assert
      expect(result).toEqual([]);
    });
  });
  
  describe('deleteMessage', () => {
    it('should delete a message from SQS and Redis', async () => {
      // Arrange
      const sqsDeleteMessageSpy = jest.spyOn(SQSManager.prototype, 'deleteMessage')
        .mockResolvedValueOnce();
      
      const redisRemoveMessageSpy = jest.spyOn(RedisManager.prototype, 'removeMessage')
        .mockResolvedValueOnce();
      
      const redisGetQueueDepthSpy = jest.spyOn(RedisManager.prototype, 'getQueueDepthByPriority')
        .mockResolvedValueOnce({ 0: 1, 1: 2, 2: 3 });
      
      // Act
      await service.deleteMessage('receipt-handle', 'message-id', 0);
      
      // Assert
      expect(sqsDeleteMessageSpy).toHaveBeenCalledWith('receipt-handle');
      expect(redisRemoveMessageSpy).toHaveBeenCalledWith('message-id', 0);
      expect(redisGetQueueDepthSpy).toHaveBeenCalledTimes(1);
    });
    
    it('should only delete from SQS if messageId and priority are not provided', async () => {
      // Arrange
      const sqsDeleteMessageSpy = jest.spyOn(SQSManager.prototype, 'deleteMessage')
        .mockResolvedValueOnce();
      
      const redisRemoveMessageSpy = jest.spyOn(RedisManager.prototype, 'removeMessage');
      
      // Act
      await service.deleteMessage('receipt-handle');
      
      // Assert
      expect(sqsDeleteMessageSpy).toHaveBeenCalledWith('receipt-handle');
      expect(redisRemoveMessageSpy).not.toHaveBeenCalled();
    });
  });
  
  describe('getQueueDepthByPriority', () => {
    it('should return queue depth by priority', async () => {
      // Arrange
      const queueDepth = { 0: 1, 1: 2, 2: 3 };
      jest.spyOn(RedisManager.prototype, 'getQueueDepthByPriority')
        .mockResolvedValueOnce(queueDepth);
      
      // Act
      const result = await service.getQueueDepthByPriority();
      
      // Assert
      expect(result).toEqual(queueDepth);
    });
  });
  
  describe('getProcessingLatencyByPriority', () => {
    it('should return processing latency by priority', async () => {
      // Arrange
      const latency = { 0: 100, 1: 200, 2: 300 };
      jest.spyOn(RedisManager.prototype, 'getProcessingLatencyByPriority')
        .mockResolvedValueOnce(latency);
      
      // Act
      const result = await service.getProcessingLatencyByPriority();
      
      // Assert
      expect(result).toEqual(latency);
    });
  });
  
  describe('purgeQueue', () => {
    it('should purge the queue', async () => {
      // Arrange
      const sqsPurgeQueueSpy = jest.spyOn(SQSManager.prototype, 'purgeQueue')
        .mockResolvedValueOnce();
      
      // Act
      await service.purgeQueue();
      
      // Assert
      expect(sqsPurgeQueueSpy).toHaveBeenCalledTimes(1);
    });
  });
});
