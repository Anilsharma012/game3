import 'dotenv/config';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001';

async function req<T = any>(
  method: string,
  path: string,
  body?: any,
  token?: string,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    throw new Error(`Invalid JSON response for ${path}: ${text}`);
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${data?.message || text}`);
  }
  return data as T;
}

function unique(n: number) {
  return `${Date.now()}${Math.floor(Math.random() * 10000)}${n}`;
}

async function run() {
  console.log('▶️ Starting referral flow test against', BASE_URL);

  // 1) Create referrer user
  const refMobile = `9${unique(1).slice(-9)}`; // ensure 10-digit starting 9
  const refEmail = `ref_${unique(2)}@example.com`;
  const refName = 'Ref Tester';

  const refReg = await req<any>('POST', '/api/auth/register', {
    fullName: refName,
    email: refEmail,
    mobile: refMobile,
    password: 'Test@1234',
  });
  const refToken: string = refReg.token;
  const refUser = refReg.user;
  if (!refUser?.referralCode) throw new Error('Referrer referralCode missing');
  console.log('✅ Referrer created:', refUser.fullName, refUser.mobile, 'code:', refUser.referralCode);

  // 2) Create new user using referrer's code
  const newMobile = `9${unique(3).slice(-9)}`;
  const newEmail = `new_${unique(4)}@example.com`;
  const newName = 'New Tester';

  const newReg = await req<any>('POST', '/api/auth/register', {
    fullName: newName,
    email: newEmail,
    mobile: newMobile,
    password: 'Test@1234',
    referralCode: refUser.referralCode,
  });
  const newToken: string = newReg.token;
  const newUser = newReg.user;
  console.log('✅ New user created with referral:', newUser.fullName, newUser.mobile);

  // 3) Fetch wallets
  const refWallet = await req<any>('GET', '/api/wallet/balance', undefined, refToken);
  const newWallet = await req<any>('GET', '/api/wallet/balance', undefined, newToken);

  // 4) Fetch bonus transactions
  const refTx = await req<any>('GET', '/api/wallet/transactions?type=bonus&limit=5', undefined, refToken);
  const newTx = await req<any>('GET', '/api/wallet/transactions?type=bonus&limit=5', undefined, newToken);

  // 5) Fetch profiles for stats
  const refProfile = await req<any>('GET', '/api/auth/profile', undefined, refToken);
  const newProfile = await req<any>('GET', '/api/auth/profile', undefined, newToken);

  const refBonusBalance = refWallet?.data?.bonusBalance ?? 0;
  const newBonusBalance = newWallet?.data?.bonusBalance ?? 0;

  const refBonusTx = (refTx?.data?.transactions || []).filter((t: any) => t.type === 'bonus');
  const newBonusTx = (newTx?.data?.transactions || []).filter((t: any) => t.type === 'bonus');

  console.log('\n===== REFERRAL TEST RESULT =====');
  console.log('Referrer:', {
    id: refUser.id,
    name: refUser.fullName,
    mobile: refUser.mobile,
    referralCode: refUser.referralCode,
    bonusBalance: refBonusBalance,
    bonusTransactions: refBonusTx.map((t: any) => ({ amount: t.amount, status: t.status, desc: t.description })),
    referralStats: refProfile?.user?.referralStats,
  });
  console.log('New User:', {
    id: newUser.id,
    name: newUser.fullName,
    mobile: newUser.mobile,
    referralCode: newUser.referralCode,
    bonusBalance: newBonusBalance,
    bonusTransactions: newBonusTx.map((t: any) => ({ amount: t.amount, status: t.status, desc: t.description })),
    referralStats: newProfile?.user?.referralStats,
  });

  // Basic assertions
  if (refBonusBalance <= 0) throw new Error('Referrer bonusBalance not credited');
  if (newBonusBalance <= 0) throw new Error('New user bonusBalance not credited');
  if (!refBonusTx.length) throw new Error('Referrer bonus transaction missing');
  if (!newBonusTx.length) throw new Error('New user bonus transaction missing');

  console.log('\n🎉 Referral flow OK: Bonuses credited and transactions recorded.');
}

run().catch((e) => {
  console.error('❌ Referral test failed:', e?.message || e);
  process.exit(1);
});
