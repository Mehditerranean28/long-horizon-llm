const nodemailer = require('nodemailer');
const { SMTP_URL } = require('./constants');

let transporter;

if (SMTP_URL) {
  try {
    transporter = nodemailer.createTransport(SMTP_URL);
    console.log('✅ Nodemailer transporter initialized with SMTP_URL.');
  } catch (error) {
    console.error('❌ FATAL: Failed to initialize Nodemailer transporter with SMTP_URL.', error.message);
    transporter = nodemailer.createTransport({ streamTransport: true, newline: 'unix' });
    console.warn('⚠️ Falling back to stream transport due to SMTP_URL initialization failure.');
  }
} else {
  console.warn('⚠️ No SMTP_URL provided. Defaulting to stream transport. Emails will NOT be sent.');
  transporter = nodemailer.createTransport({ streamTransport: true, newline: 'unix' });
}

async function sendMail(options) {
  if (!transporter) {
    console.error('❌ sendMail: Transporter is not initialized. Cannot send email.');
    return Promise.reject(new Error('Email transporter not initialized.'));
  }

  try {
    const info = await transporter.sendMail(options);
    console.log('✉️ Email sent successfully. Message ID: %s, Preview URL: %s', info.messageId, nodemailer.getTestMessageUrl(info));
    return info;
  } catch (error) {
    console.error('❌ Failed to send email.', {
      error: error.message,
      code: error.code,
      options: { to: options.to, subject: options.subject },
    });
    return Promise.reject(new Error(`Email sending failed: ${error.message}`));
  }
}

module.exports = { sendMail };
