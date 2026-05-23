const fetch = require('node-fetch');

const BALE_TOKEN = '1202932869:TDsjeoVKh3tB75jwtkB5sJH295ZfgK8xFp4';
const WEBHOOK_URL = 'https://baletranslator-production.up.railway.app/api/webhook';

async function setWebhook() {
  try {
    const response = await fetch(
      `https://tapi.bale.ai/bot${BALE_TOKEN}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: WEBHOOK_URL })
      }
    );
    
    const data = await response.json();
    console.log('Webhook response:', JSON.stringify(data, null, 2));
    
    if (data.ok) {
      console.log('✅ Webhook set successfully!');
    } else {
      console.log('❌ Failed to set webhook:', data.description);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

async function getWebhookInfo() {
  try {
    const response = await fetch(
      `https://tapi.bale.ai/bot${BALE_TOKEN}/getWebhookInfo`
    );
    
    const data = await response.json();
    console.log('\nWebhook info:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error getting webhook info:', error.message);
  }
}

async function main() {
  console.log('Setting webhook...');
  await setWebhook();
  
  console.log('\nGetting webhook info...');
  await getWebhookInfo();
}

main();
