import nodemailer from 'nodemailer';

// Configure a mock ethereal or real transport based on .env
export const sendEmail = async (options: { email: string; subject: string; message: string }) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.NODEMAILER_USER,
      pass: process.env.NODEMAILER_PASS
    }
  });

  const message = {
    from: process.env.NODEMAILER_USER,
    to: options.email,
    subject: options.subject,
    text: options.message
  };

  const info = await transporter.sendMail(message);
  console.log('Message sent: %s', info.messageId);
};
