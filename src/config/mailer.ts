import { google } from 'googleapis';

/**
 * Sends an email using the Gmail REST API (HTTP port 443).
 * This completely bypasses the SMTP protocol (port 465/587) which avoids
 * the IPv6 ENETUNREACH issues commonly seen on platforms like Render.
 */
export const sendEmail = async (options: { email: string; subject: string; message: string; html?: string }) => {
  try {
    const OAuth2 = google.auth.OAuth2;

    const oauth2Client = new OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      'https://developers.google.com/oauthplayground' // Default redirect URI
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Safely encode subject for UTF-8 compatibility
    const utf8Subject = `=?utf-8?B?${Buffer.from(options.subject).toString('base64')}?=`;
    
    // Construct MIME message manually
    const messageParts = [
      `From: PrinToday <${process.env.GMAIL_USER}>`,
      `To: ${options.email}`,
      `Subject: ${utf8Subject}`,
      `MIME-Version: 1.0`,
      options.html ? `Content-Type: text/html; charset=utf-8` : `Content-Type: text/plain; charset=utf-8`,
      '',
      options.html || options.message,
    ];
    
    const message = messageParts.join('\r\n');
    
    // The Gmail API requires the message to be base64url encoded
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    console.log('Message sent via Gmail API: %s', res.data.id);
  } catch (error) {
    console.error('Error sending email via Gmail API:', error);
    throw error;
  }
};
