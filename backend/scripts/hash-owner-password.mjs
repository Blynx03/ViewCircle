import readline from 'node:readline/promises';
import { Writable } from 'node:stream';
import bcrypt from 'bcryptjs';

if (!process.stdin.isTTY) throw new Error('Run interactively in a local terminal.');
const muted = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
const prompt = readline.createInterface({ input: process.stdin, output: muted, terminal: true });
try {
  process.stdout.write('Owner password (hidden, 12+ characters): ');
  const password = await prompt.question('');
  process.stdout.write('\nConfirm password (hidden): ');
  const confirmation = await prompt.question('');
  if (password !== confirmation) throw new Error('Passwords do not match.');
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) throw new Error('Use at least 12 characters and at most 72 UTF-8 bytes.');
  process.stdout.write(`\nOWNER_PASSWORD_HASH=${await bcrypt.hash(password, 12)}\n`);
} finally { prompt.close(); }
