import * as dotenv from 'dotenv';
import { sendSms } from './src/lib/sms.js';

dotenv.config({ path: './.env' });

async function runTest() {
  console.log('Testing bulk SMS with array of numbers:');
  const res1 = await sendSms(['+254710320637', '254748081148', '+254701968880'], 'Test bulk message');
  console.log(JSON.stringify(res1.raw, null, 2));
}

runTest();
