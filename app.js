require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const port = 3000;

const oAuth2Client = new OAuth2Client(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

async function startApp() {
  try {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });
    console.log(`Open this URL in your browser to sign in: ${authUrl}`);
  } catch (error) {
    console.error('Authentication error:', error);
  }
}

app.get('/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      res.send('Authorization code not found.');
      return;
    }

    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    console.log('Authentication successful!');
    res.send('Authentication successful! You can close this page.');
    startEmailProcessing();
  } catch (error) {
    console.error('Authentication error:', error);
    res.send('Authentication failed.');
  }
});

async function processEmails() {
  try {
    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread',
    });

    const messages = response.data.messages;
    if (!messages || messages.length === 0) {
      console.log('No unread emails found.');
      return;
    }

    for (const message of messages) {
      try {
        const threadResponse = await gmail.users.threads.get({
          userId: 'me',
          id: message.threadId,
        });
        const thread = threadResponse.data;
        const firstEmail = thread.messages[0];

        let fromAddress = '';
        let subject = '';

        firstEmail.payload.headers.forEach(header => {
          if (header.name.toLowerCase() === 'from') {
            fromAddress = header.value;
          } else if (header.name.toLowerCase() === 'subject') {
            subject = header.value;
          }
        });

        if (!fromAddress || !subject) {
          console.error('Missing headers in the email');
          continue;
        }

        const replyMessageRaw = `To: ${fromAddress}\r\nSubject: Re: ${subject}\r\n\r\nThis is your automated reply.`;
        const encodedMessage = Buffer.from(replyMessageRaw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        const replyMessage = {
          userId: 'me',
          resource: {
            raw: encodedMessage,
          },
        };

        await gmail.users.messages.send(replyMessage);

        await gmail.users.messages.modify({
          userId: 'me',
          id: message.id,
          resource: {
            removeLabelIds: ['UNREAD'],
          },
        });
        console.log('Replied to email and marked as read:', message.id);

      } catch (err) {
        console.error(`Error processing message ID ${message.id}:`, err.message);

      }
    }
  } catch (error) {
    console.error('Error processing emails:', error);
  }
}





async function startEmailProcessing() {
  while (true) {
    await processEmails();
    const minInterval = 45 * 1000;
    const maxInterval = 120 * 1000;
    const interval = Math.floor(Math.random() * (maxInterval - minInterval + 1) + minInterval);

    console.log(`Next task will run in ${interval / 1000} seconds`);
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
  startApp();
});
