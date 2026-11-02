import { spawn } from 'node:child_process';
import http from 'node:http';
import WebSocket from 'ws';

async function main() {
  console.log('Testing Chrome launch and CDP connection...');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = 'C:\\Users\\prana\\AppData\\Local\\Temp\\chrome-test-profile-' + Date.now();

  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9333',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ]);

  try {
    let connected = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 250));
      try {
        const res = await fetch('http://127.0.0.1:9333/json/version');
        if (res.ok) {
          const data = await res.json();
          console.log('CDP Version Info:', data);
          connected = true;
          break;
        }
      } catch (e) {
        // Retry
      }
    }
    if (!connected) {
      throw new Error('Could not connect to Chrome CDP endpoint');
    }
    console.log('Chrome CDP successfully verified!');
  } finally {
    chromeProc.kill();
  }
}

main().catch(err => {
  console.error('CDP test failed:', err);
  process.exit(1);
});

