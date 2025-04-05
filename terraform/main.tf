provider "aws" {
  region = var.aws_region
}

# SQS Queue
resource "aws_sqs_queue" "priority_queue_dlq" {
  name                      = "priority-queue-dlq-${var.environment}"
  message_retention_seconds = 1209600 # 14 days
  
  tags = {
    Environment = var.environment
  }
}

resource "aws_sqs_queue" "priority_queue" {
  name                       = "priority-queue-${var.environment}"
  visibility_timeout_seconds = 30
  message_retention_seconds  = 1209600 # 14 days
  receive_wait_time_seconds  = 20 # Long polling
  
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.priority_queue_dlq.arn
    maxReceiveCount     = 5
  })
  
  tags = {
    Environment = var.environment
  }
}

# VPC
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  
  tags = {
    Name        = "priority-queue-vpc-${var.environment}"
    Environment = var.environment
  }
}

# Subnets
resource "aws_subnet" "private_1" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = data.aws_availability_zones.available.names[0]
  
  tags = {
    Name        = "priority-queue-private-subnet-1-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_subnet" "private_2" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.2.0/24"
  availability_zone = data.aws_availability_zones.available.names[1]
  
  tags = {
    Name        = "priority-queue-private-subnet-2-${var.environment}"
    Environment = var.environment
  }
}

# Security Groups
resource "aws_security_group" "app" {
  name        = "priority-queue-app-sg-${var.environment}"
  description = "Security group for applications using the priority queue"
  vpc_id      = aws_vpc.main.id
  
  tags = {
    Environment = var.environment
  }
}

resource "aws_security_group" "redis" {
  name        = "priority-queue-redis-sg-${var.environment}"
  description = "Security group for Priority Queue Redis"
  vpc_id      = aws_vpc.main.id
  
  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }
  
  tags = {
    Environment = var.environment
  }
}

# Redis
resource "aws_elasticache_subnet_group" "redis" {
  name       = "priority-queue-redis-subnet-group-${var.environment}"
  subnet_ids = [aws_subnet.private_1.id, aws_subnet.private_2.id]
  
  tags = {
    Environment = var.environment
  }
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "priority-queue-redis-${var.environment}"
  engine               = "redis"
  node_type            = "cache.t3.micro"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  subnet_group_name    = aws_elasticache_subnet_group.redis.name
  security_group_ids   = [aws_security_group.redis.id]
  
  tags = {
    Environment = var.environment
  }
}

# IAM Role
resource "aws_iam_role" "priority_queue_role" {
  name = "priority-queue-role-${var.environment}"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
  
  tags = {
    Environment = var.environment
  }
}

resource "aws_iam_role_policy_attachment" "sqs_full_access" {
  role       = aws_iam_role.priority_queue_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSQSFullAccess"
}

# CloudWatch Dashboard
resource "aws_cloudwatch_dashboard" "priority_queue" {
  dashboard_name = "priority-queue-dashboard-${var.environment}"
  
  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        x    = 0
        y    = 0
        width = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", aws_sqs_queue.priority_queue.name],
            [".", "ApproximateNumberOfMessagesNotVisible", ".", "."],
            [".", "ApproximateNumberOfMessagesDelayed", ".", "."]
          ]
          view = "timeSeries"
          stacked = false
          region = var.aws_region
          title = "Queue Metrics"
          period = 300
        }
      },
      {
        type = "metric"
        x    = 0
        y    = 6
        width = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/SQS", "NumberOfMessagesSent", "QueueName", aws_sqs_queue.priority_queue.name],
            [".", "NumberOfMessagesReceived", ".", "."],
            [".", "NumberOfMessagesDeleted", ".", "."]
          ]
          view = "timeSeries"
          stacked = false
          region = var.aws_region
          title = "Message Operations"
          period = 300
        }
      },
      {
        type = "metric"
        x    = 12
        y    = 0
        width = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/SQS", "ApproximateAgeOfOldestMessage", "QueueName", aws_sqs_queue.priority_queue.name]
          ]
          view = "timeSeries"
          stacked = false
          region = var.aws_region
          title = "Message Age"
          period = 300
        }
      },
      {
        type = "metric"
        x    = 12
        y    = 6
        width = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", aws_sqs_queue.priority_queue_dlq.name]
          ]
          view = "timeSeries"
          stacked = false
          region = var.aws_region
          title = "Dead Letter Queue"
          period = 300
        }
      }
    ]
  })
}

# Data sources
data "aws_availability_zones" "available" {}
