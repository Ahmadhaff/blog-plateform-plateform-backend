const amqp = require('amqplib');

let rabbitChannel = null;
let rabbitConnection = null;

const connectRabbitMQ = async () => {
  try {
    rabbitConnection = await amqp.connect(process.env.RABBITMQ_URL);
    rabbitChannel = await rabbitConnection.createChannel();

    await rabbitChannel.assertExchange('blog-events', 'topic', { durable: true });
    return rabbitChannel;
  } catch (error) {
    console.error('❌ RabbitMQ connection error:', error);
    setTimeout(connectRabbitMQ, 5000);
  }
};

const getRabbitChannel = () => {
  if (!rabbitChannel) {
    throw new Error('RabbitMQ channel not initialized');
  }
  return rabbitChannel;
};

const publishEvent = async (routingKey, data) => {
  const channel = getRabbitChannel();
  const event = {
    timestamp: new Date().toISOString(),
    ...data
  };

  channel.publish(
    'blog-events',
    routingKey,
    Buffer.from(JSON.stringify(event)),
    { persistent: true }
  );
};

module.exports = { connectRabbitMQ, getRabbitChannel, publishEvent };
