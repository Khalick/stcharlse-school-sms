import * as dotenv from 'dotenv';
import { sendSms } from './src/lib/sms.js';

dotenv.config({ path: './.env' });

async function runTest() {
  console.log('Testing with + prefix:');
  const res1 = await sendSms('+254710320637', 'Test message with plus');
  console.log(JSON.stringify(res1.raw, null, 2));

  console.log('\nTesting without + prefix:');
  const res2 = await sendSms('254710320637', 'Test message without plus');
  console.log(JSON.stringify(res2.raw, null, 2));
}

runTest();
