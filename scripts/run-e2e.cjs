const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const host = '127.0.0.1';
const port = 19191;
const baseUrl = `http://${host}:${port}`;
const viteBin = path.join(__dirname, '..', 'node_modules', 'vite', 'bin', 'vite.js');
const playwrightCli = path.join(__dirname, '..', 'node_modules', 'playwright', 'cli.js');

function waitForServer(url, timeoutMs = 30000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    function check() {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });

      req.on('error', () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }
        setTimeout(check, 250);
      });

      req.setTimeout(1000, () => {
        req.destroy();
      });
    }

    check();
  });
}

function run(command, args, options = {}) {
  return spawn(command, args, {
    stdio: 'inherit',
    shell: false,
    ...options
  });
}

async function main() {
  const server = run(process.execPath, [viteBin, '--host', host, '--port', String(port), '--strictPort']);

  const stopServer = () => {
    if (!server.killed) server.kill();
  };

  process.on('exit', stopServer);
  process.on('SIGINT', () => {
    stopServer();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    stopServer();
    process.exit(143);
  });

  try {
    await waitForServer(baseUrl);

    const testArgs = [playwrightCli, 'test', '--config=playwright.config.cjs', ...process.argv.slice(2)];
    const tests = run(process.execPath, testArgs);
    const code = await new Promise((resolve) => {
      tests.on('exit', (exitCode) => resolve(exitCode || 0));
    });

    stopServer();
    process.exit(code);
  } catch (error) {
    stopServer();
    console.error(error.message);
    process.exit(1);
  }
}

main();
