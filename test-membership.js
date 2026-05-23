const fetch = require('node-fetch');

const BALE_TOKEN = '1202932869:TDsjeoVKh3tB75jwtkB5sJH295ZfgK8xFp4';
const BALE_API = `https://tapi.bale.ai/bot${BALE_TOKEN}`;
const REQUIRED_CHANNEL = "@motarjem_mehran";

// شناسه کاربری خودتان را اینجا وارد کنید
const TEST_USER_ID = process.argv[2];

async function testMembership(userId) {
  if (!userId) {
    console.log('❌ لطفاً شناسه کاربری را وارد کنید:');
    console.log('   node test-membership.js YOUR_USER_ID');
    console.log('\nبرای پیدا کردن شناسه کاربری خود:');
    console.log('1. به ربات @userinfobot در بله پیام دهید');
    console.log('2. یا از ربات خودتان /start بزنید و در لاگ‌های Railway شناسه را ببینید');
    return;
  }

  console.log(`\n🔍 در حال بررسی عضویت کاربر ${userId} در کانال ${REQUIRED_CHANNEL}...\n`);

  try {
    const res = await fetch(`${BALE_API}/getChatMember`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        chat_id: REQUIRED_CHANNEL, 
        user_id: parseInt(userId) 
      }),
    });
    
    const txt = await res.text();
    console.log('📥 پاسخ خام از API:');
    console.log(txt);
    console.log('\n');

    let j;
    try {
      j = JSON.parse(txt);
    } catch (parseErr) {
      console.error('❌ خطا در parse کردن JSON:', parseErr.message);
      return;
    }

    if (!j?.ok) {
      console.error('❌ درخواست ناموفق بود:');
      console.error('   توضیحات:', j?.description || 'توضیحی وجود ندارد');
      console.error('\n💡 راهکارهای احتمالی:');
      console.error('   1. مطمئن شوید ربات در کانال عضو است');
      console.error('   2. مطمئن شوید ربات در کانال ادمین است');
      console.error('   3. username کانال را بررسی کنید (باید @ داشته باشد)');
      console.error('   4. شناسه کاربری را بررسی کنید');
      return;
    }

    const status = j?.result?.status;
    const user = j?.result?.user;
    
    console.log('✅ درخواست موفق بود!');
    console.log('\n📊 اطلاعات کاربر:');
    console.log('   نام:', user?.first_name || 'نامشخص');
    console.log('   نام کاربری:', user?.username ? `@${user.username}` : 'ندارد');
    console.log('   شناسه:', user?.id);
    console.log('\n📋 وضعیت عضویت:', status);
    
    const isMember = (
      status === "member" ||
      status === "administrator" ||
      status === "creator" ||
      status === "owner"
    );
    
    if (isMember) {
      console.log('\n✅ کاربر عضو کانال است!');
    } else {
      console.log('\n❌ کاربر عضو کانال نیست!');
      console.log('   وضعیت فعلی:', status);
    }

  } catch (e) {
    console.error('❌ خطای غیرمنتظره:', e.message);
    console.error(e);
  }
}

// دریافت اطلاعات کانال
async function getChannelInfo() {
  console.log(`\n🔍 دریافت اطلاعات کانال ${REQUIRED_CHANNEL}...\n`);
  
  try {
    const res = await fetch(`${BALE_API}/getChat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: REQUIRED_CHANNEL }),
    });
    
    const data = await res.json();
    
    if (data.ok) {
      console.log('✅ اطلاعات کانال:');
      console.log('   عنوان:', data.result.title);
      console.log('   نوع:', data.result.type);
      console.log('   شناسه:', data.result.id);
      if (data.result.username) {
        console.log('   نام کاربری:', `@${data.result.username}`);
      }
    } else {
      console.log('❌ خطا در دریافت اطلاعات کانال:');
      console.log('   ', data.description);
    }
  } catch (e) {
    console.error('❌ خطا:', e.message);
  }
}

async function main() {
  await getChannelInfo();
  console.log('\n' + '='.repeat(60) + '\n');
  await testMembership(TEST_USER_ID);
}

main();
