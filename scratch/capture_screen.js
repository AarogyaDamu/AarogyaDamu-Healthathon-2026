const fs = require('fs');
const cp = require('child_process');
const path = require('path');

const adb = path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe');
const targetFile = 'C:\\Users\\prana\\.gemini\\antigravity-ide\\brain\\4dcd9c02-722d-42f2-a370-8742b1a17566\\android_screen_welcome.png';

try {
  cp.execFileSync(adb, ['-s', 'emulator-5554', 'shell', 'screencap', '-p', '/sdcard/welcome.png'], { timeout: 5000 });
  cp.execFileSync(adb, ['-s', 'emulator-5554', 'pull', '/sdcard/welcome.png', targetFile], { timeout: 5000 });
  const stat = fs.statSync(targetFile);
  console.log('Successfully captured and pulled welcome screen! Size:', stat.size);
} catch (e) {
  console.error('Error:', e.message);
}
