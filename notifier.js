// notifier.js
const Twilio = require('twilio');

let client = null;
function initTwilio(sid, token) {
  if (sid && token) client = Twilio(sid, token);
}

async function sendWhatsApp(from, to, body) {
  if (!client) {
    console.log('[notify] Twilio not configured. Msg:', body);
    return;
  }
  try {
    await client.messages.create({ from, to, body });
  } catch (e) {
    console.error('[notify] Twilio error', e.message);
  }
}

module.exports = { initTwilio, sendWhatsApp };
