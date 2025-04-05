import { RedisManager } from '../../src/services/RedisManager';
import { createClient } from 'redis';

// Mock redis
jest.mock('redis', () => {
  const mockZAdd = jest.fn().mockResolvedValue(undefined);
  const mockZRange = jest.fn().mockResolvedValue([]);
  const mockZRem = jest.fn().mockResolvedValue(undefined);
  const mockZCard = jest.fn().mockResolvedValue(0);
  const mockSet = jest.fn().mockResolvedValue(undefined);
  const mockGet = jest.fn().mockResolvedValue(null);
  const mockDel = jest.fn().mockResolvedValue(undefined);

  const mockClient = {
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    zAdd: mockZAdd,
    zRange: mockZRange,
    zRem: mockZRem,
    zCard: mockZCard,
    set: mockSet,
    get: mockGet,
    del: mockDel,
  };

  return {
    createClient: jest.fn().mockReturnValue(mockClient),
  };
});

describe('RedisManager', () => {
  let redisManager: RedisManager;
  let mockRedisClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    redisManager = new RedisManager('redis://localhost:6379', 3);
    mockRedisClient = (createClient as jest.Mock)();
  });

  describe('connect', () => {
    it('should connect to Redis', async () => {
      // Act
      await redisManager.connect();

      // Assert
      expect(mockRedisClient.connect).toHaveBeenCalledTimes(1);
      expect(redisManager.isConnected()).toBe(true);
    });

    it('should throw an error if connection fails', async () => {
      // Arrange
      mockRedisClient.connect.mockRejectedValueOnce(new Error('Connection failed'));

      // Act & Assert
      await expect(redisManager.connect()).rejects.toThrow('Connection failed');
      expect(redisManager.isConnected()).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('should disconnect from Redis', async () => {
      // Arrange
      await redisManager.connect();

      // Act
      await redisManager.disconnect();

      // Assert
      expect(mockRedisClient.quit).toHaveBeenCalledTimes(1);
      expect(redisManager.isConnected()).toBe(false);
    });

    it('should not call quit if not connected', async () => {
      // Act
      await redisManager.disconnect();

      // Assert
      expect(mockRedisClient.quit).not.toHaveBeenCalled();
    });
  });

  describe('addMessage', () => {
    it('should add a message to Redis', async () => {
      // Arrange
      await redisManager.connect();
      const messageId = 'test-message-id';
      const priority = 0;
      const metadata = {
        id: messageId,
        priority,
        sentAt: Date.now(),
        receiveCount: 0,
      };

      // Act
      await redisManager.addMessage(messageId, priority, metadata);

      // Assert
      expect(mockRedisClient.set).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.zAdd).toHaveBeenCalledTimes(1);
    });

    it('should throw an error if not connected', async () => {
      // Act & Assert
      await expect(redisManager.addMessage('id', 0, { id: 'id', priority: 0, sentAt: 0, receiveCount: 0 }))
        .rejects.toThrow('Redis client is not connected');
    });
  });

  describe('getNextMessages', () => {
    it('should get messages from Redis based on priority', async () => {
      // Arrange
      await redisManager.connect();

      // Clear previous mock calls
      mockRedisClient.zCard.mockClear();
      mockRedisClient.zRange.mockClear();

      // Setup mocks for 3 priority levels
      mockRedisClient.zCard
        .mockResolvedValueOnce(5) // Priority 0
        .mockResolvedValueOnce(3) // Priority 1
        .mockResolvedValueOnce(1); // Priority 2

      mockRedisClient.zRange.mockResolvedValueOnce(['id1', 'id2', 'id3', 'id4', 'id5']);

      // Act
      const result = await redisManager.getNextMessages(10);

      // Assert
      expect(mockRedisClient.zCard).toHaveBeenCalledTimes(3);
      expect(mockRedisClient.zRange).toHaveBeenCalled();
      expect(result).toEqual(['id1', 'id2', 'id3', 'id4', 'id5']);
    });

    it('should prevent starvation of lower priority messages', async () => {
      // Arrange
      await redisManager.connect();

      // Clear previous mock calls
      mockRedisClient.zCard.mockClear();
      mockRedisClient.zRange.mockClear();

      mockRedisClient.zCard
        .mockResolvedValueOnce(5) // Priority 0
        .mockResolvedValueOnce(101) // Priority 1 (above threshold)
        .mockResolvedValueOnce(50); // Priority 2

      mockRedisClient.zRange
        .mockResolvedValueOnce(['id1', 'id2']) // Priority 0
        .mockResolvedValueOnce(['id3', 'id4', 'id5', 'id6']) // Priority 1
        .mockResolvedValueOnce(['id7', 'id8']); // Priority 2

      // Act
      const result = await redisManager.getNextMessages(10, 100);

      // Assert
      expect(mockRedisClient.zCard).toHaveBeenCalledTimes(3);
      expect(mockRedisClient.zRange).toHaveBeenCalledTimes(3);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should throw an error if not connected', async () => {
      // Act & Assert
      await expect(redisManager.getNextMessages())
        .rejects.toThrow('Redis client is not connected');
    });
  });

  describe('getMessageMetadata', () => {
    it('should get message metadata from Redis', async () => {
      // Arrange
      await redisManager.connect();
      const metadata = {
        id: 'test-id',
        priority: 0,
        sentAt: Date.now(),
        receiveCount: 1,
      };
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(metadata));

      // Act
      const result = await redisManager.getMessageMetadata('test-id');

      // Assert
      expect(mockRedisClient.get).toHaveBeenCalledTimes(1);
      expect(result).toEqual(metadata);
    });

    it('should return null if metadata not found', async () => {
      // Arrange
      await redisManager.connect();
      mockRedisClient.get.mockResolvedValueOnce(null);

      // Act
      const result = await redisManager.getMessageMetadata('test-id');

      // Assert
      expect(result).toBeNull();
    });

    it('should throw an error if not connected', async () => {
      // Act & Assert
      await expect(redisManager.getMessageMetadata('test-id'))
        .rejects.toThrow('Redis client is not connected');
    });
  });

  describe('markMessageAsReceived', () => {
    it('should update message metadata when received', async () => {
      // Arrange
      await redisManager.connect();
      const metadata = {
        id: 'test-id',
        priority: 0,
        sentAt: Date.now(),
        receiveCount: 1,
      };
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(metadata));

      // Act
      await redisManager.markMessageAsReceived('test-id');

      // Assert
      expect(mockRedisClient.get).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.set).toHaveBeenCalledTimes(1);
    });

    it('should do nothing if metadata not found', async () => {
      // Arrange
      await redisManager.connect();
      mockRedisClient.get.mockResolvedValueOnce(null);

      // Act
      await redisManager.markMessageAsReceived('test-id');

      // Assert
      expect(mockRedisClient.get).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.set).not.toHaveBeenCalled();
    });

    it('should throw an error if not connected', async () => {
      // Act & Assert
      await expect(redisManager.markMessageAsReceived('test-id'))
        .rejects.toThrow('Redis client is not connected');
    });
  });

  describe('removeMessage', () => {
    it('should remove a message from Redis', async () => {
      // Arrange
      await redisManager.connect();

      // Act
      await redisManager.removeMessage('test-id', 0);

      // Assert
      expect(mockRedisClient.zRem).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.del).toHaveBeenCalledTimes(1);
    });

    it('should throw an error if not connected', async () => {
      // Act & Assert
      await expect(redisManager.removeMessage('test-id', 0))
        .rejects.toThrow('Redis client is not connected');
    });
  });

  describe('getQueueDepthByPriority', () => {
    it('should get queue depth for all priority levels', async () => {
      // Arrange
      await redisManager.connect();
      mockRedisClient.zCard
        .mockResolvedValueOnce(5) // Priority 0
        .mockResolvedValueOnce(10) // Priority 1
        .mockResolvedValueOnce(15); // Priority 2

      // Act
      const result = await redisManager.getQueueDepthByPriority();

      // Assert
      expect(mockRedisClient.zCard).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ 0: 5, 1: 10, 2: 15 });
    });

    it('should throw an error if not connected', async () => {
      // Act & Assert
      await expect(redisManager.getQueueDepthByPriority())
        .rejects.toThrow('Redis client is not connected');
    });
  });
});
