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
    }
  });

  return transporter;
};

module.exports = {
  getEmailTransporter
};

