const nodemailer = require('nodemailer');

let transporter;

const getEmailTransporter = () => {
  if (transporter) {
    return transporter;
  }

  if (!process.env.SMTP_HOST) {
    throw new Error('SMTP_HOST environment variable is not set');
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USERNAME,
      pass: process.env.SMTP_PASSWORD
    },
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 10000, // 10 seconds
    socketTimeout: 10000, // 10 seconds
    pool: true, // Use connection pooling
    maxConnections: 1,
    maxMessages: 3,
    // For Gmail, try to use STARTTLS if secure is false
    requireTLS: process.env.SMTP_SECURE !== 'true',
    tls: {
      // Don't reject unauthorized certificates (some SMTP servers use self-signed)
      rejectUnauthorized: false
    }
  });

  return transporter;
};

module.exports = {
  getEmailTransporter
};

