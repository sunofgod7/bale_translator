const fetch = require('node-fetch');

const BALE_TOKEN = '1202932869:TDsjeoVKh3tB75jwtkB5sJH295ZfgK8xFp4';
const BALE_API = `https://tapi.bale.ai/bot${BALE_TOKEN}`;
const REQUIRED_CHANNEL = "@motarjem_mehran";

async function createInviteLink() {
  console.log(`\n🔗 ساخت لینک دعوت برای کانال ${REQUIRED_CHANNEL}...\n`);

  try {
    const res = await fetch(`${BALE_API}/exportChatInviteLink`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: REQUIRED_CHANNEL }),
    });
    
    const data = await res.json();
    
    if (data.ok) {
      console.log('✅ لینک دعوت با موفقیت ساخته شد:');
      console.log('\n   ', data.result);
      console.log('\n💡 این لینک را در کد خود استفاده کنید.');
      console.log('   یا آن را در دکمه "عضویت در کانال" قرار دهید.\n');
    } else {
      console.log('❌ خطا در ساخت لینک دعوت:');
      console.log('   ', data.description);
      console.log('\n💡 راهکارها:');
      console.log('   1. مطمئن شوید ربات در کانال عضو است');
      console.log('   2. مطمئن شوید ربات ادمین کانال است');
      console.log('   3. مطمئن شوید ربات دسترسی "Invite users" دارد\n');
    }
  } catch (e) {
    console.error('❌ خطا:', e.message);
  }
}

async function getChatAdministrators() {
  console.log(`\n👥 دریافت لیست ادمین‌های کانال ${REQUIRED_CHANNEL}...\n`);

  try {
    const res = await fetch(`${BALE_API}/getChatAdministrators`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: REQUIRED_CHANNEL }),
    });
    
    const data = await res.json();
    
    if (data.ok) {
      console.log('✅ لیست ادمین‌ها:');
      data.result.forEach((admin, i) => {
        const user = admin.user;
        const isBot = user.is_bot ? '🤖' : '👤';
        console.log(`   ${i + 1}. ${isBot} ${user.first_name || 'بدون نام'} (@${user.username || 'بدون username'}) - ${admin.status}`);
      });
      
      const botInList = data.result.find(admin => admin.user.is_bot);
      if (botInList) {
        console.log('\n✅ ربات در لیست ادمین‌ها است!');
      } else {
        console.log('\n❌ ربات در لیست ادمین‌ها نیست!');
        console.log('   لطفاً ربات را به عنوان ادمین اضافه کنید.\n');
      }
    } else {
      console.log('❌ خطا در دریافت لیست ادمین‌ها:');
      console.log('   ', data.description);
    }
  } catch (e) {
    console.error('❌ خطا:', e.message);
  }
}

async function main() {
  await getChatAdministrators();
  console.log('\n' + '='.repeat(60) + '\n');
  await createInviteLink();
}

main();
