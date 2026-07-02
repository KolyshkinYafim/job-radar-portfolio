import 'dotenv/config';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';

async function main(): Promise<void> {
  const apiId = Number.parseInt(process.env.TELEGRAM_API_ID ?? '', 10);
  const apiHash = process.env.TELEGRAM_API_HASH ?? '';

  if (!Number.isInteger(apiId) || apiId <= 0 || !apiHash) {
    throw new Error(
      'TELEGRAM_API_ID and TELEGRAM_API_HASH must be set in .env. ' +
        'Get them at https://my.telegram.org/apps, then re-run `npm run tg:login`.',
    );
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const session = new StringSession('');
  const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });

  try {
    await client.start({
      phoneNumber: () => rl.question('Phone number (international format, e.g. +48123456789): '),
      phoneCode: () => rl.question('Login code sent by Telegram: '),
      password: (hint) => rl.question(`2FA password${hint ? ` (hint: ${hint})` : ''}: `),
      onError: (error) => {
        console.error(`Auth step failed: ${error.message}`);
      },
    });

    const sessionString = session.save();
    console.log('\nLogin successful.');
    console.log('Add this line to .env on the rig (single line, keep it secret):\n');
    console.log(`TELEGRAM_SESSION=${sessionString}\n`);
    console.log('Then restart the app — the TG listener will pick it up automatically.');
  } finally {
    rl.close();
    await client.disconnect().catch(() => undefined);
    await client.destroy().catch(() => undefined);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(`\ntg-login failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
