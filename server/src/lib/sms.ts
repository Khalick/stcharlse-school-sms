type SmsOutcome = {
  provider: 'onfon';
  recipient: string;
  ok: boolean;
  httpStatus: number;
  trace: string;
  raw: any;
};

type SendOptions = {
  senderName?: string;
};

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function sendSms(recipients: string | string[], message: string, options: SendOptions = {}): Promise<SmsOutcome> {
  const provider = (process.env.SMS_PROVIDER || 'onfon').toLowerCase();

  if (provider !== 'onfon') {
    throw new Error(`Unsupported SMS provider: ${provider}. Configure SMS_PROVIDER=onfon.`);
  }

  const apiUrl = process.env.ONFON_SMS_API_URL || 'https://api.onfonmedia.co.ke/v1/sms/SendBulkSMS';
  const accessKey = process.env.ONFON_SMS_ACCESS_KEY;
  const apiKey = process.env.ONFON_SMS_API_KEY;
  const clientId = process.env.ONFON_SMS_CLIENT_ID;
  const senderId = options.senderName || process.env.ONFON_SMS_SENDER_NAME;

  if (!accessKey) {
    throw new Error('ONFON_SMS_ACCESS_KEY is not configured. Please add it to your environment variables.');
  }

  if (!apiKey) {
    throw new Error('ONFON_SMS_API_KEY is not configured.');
  }

  if (!clientId) {
    throw new Error('ONFON_SMS_CLIENT_ID is not configured.');
  }

  if (!senderId) {
    throw new Error('ONFON_SMS_SENDER_NAME is not configured.');
  }

  const recipientArray = Array.isArray(recipients) ? recipients : [recipients];

  const requestBody = {
    SenderId: senderId,
    IsUnicode: true,
    IsFlash: false,
    MessageParameters: recipientArray.map(num => ({
      Number: num,
      Text: message
    })),
    ApiKey: apiKey,
    ClientId: clientId
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'AccessKey': accessKey
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();
    const raw = responseText ? safeJsonParse(responseText) : null;
    
    // Onfon API considers ErrorCode: 0 as Success
    const ok = response.ok && raw && raw.ErrorCode === 0;
    const trace = `${ok ? 'sent' : 'failed'} via Onfon (${response.status}) ${responseText || ''}`.trim();

    return {
      provider: 'onfon',
      recipient: recipientArray.join(', '),
      ok: !!ok,
      httpStatus: response.status,
      trace,
      raw
    };
  } catch (error: any) {
    return {
      provider: 'onfon',
      recipient: recipientArray.join(', '),
      ok: false,
      httpStatus: 0,
      trace: `Network/Fetch Error: ${error.message}`,
      raw: null
    };
  }
}
