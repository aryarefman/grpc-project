const { spawn, exec, execSync } = require('child_process');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'services.log');
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'w' }); // Use 'w' to clear logs on every start

const PORTS = [3020, 3011, 50060, 1884, 9002];

const services = [
  { name: 'CORE: SERVER & WEB', command: 'npm', args: ['run', 'server'], color: 'cyan' },
  { name: 'CORE: MQTT BROKER',  command: 'npm', args: ['run', 'mqtt:broker'], color: 'magenta' },
  { name: 'CORE: MQTT DASHBOARD', command: 'npm', args: ['run', 'mqtt:dashboard'], color: 'blue' },
  { name: 'PUB: TRAFFIC', command: 'npm', args: ['run', 'mqtt:pub:traffic'], color: 'green' },
  { name: 'PUB: ENVIRONMENT', command: 'npm', args: ['run', 'mqtt:pub:environment'], color: 'green' },
  { name: 'PUB: EMERGENCY', command: 'npm', args: ['run', 'mqtt:pub:emergency'], color: 'red' },
  { name: 'SUB: COMMAND CENTER',  command: 'npm', args: ['run', 'mqtt:sub:command-center'], color: 'yellow' },
  { name: 'SUB: PUBLIC ALERTS',   command: 'npm', args: ['run', 'mqtt:sub:public-alert'], color: 'yellow' },
];

const children = [];

/**
 * Clean up hanging processes using specific ports (Windows only for now)
 */
function preStartCleanup() {
  if (process.platform !== 'win32') return;

  console.log(chalk.yellow('  🔍 Checking for hanging processes on ports...'));
  
  PORTS.forEach(port => {
    try {
      const output = execSync(`netstat -ano | findstr :${port}`).toString();
      const lines = output.split('\n');
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length > 4 && line.includes('LISTENING')) {
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0' && pid !== process.pid.toString()) {
            console.log(chalk.gray(`  [!] Killing process ${pid} using port ${port}...`));
            try { execSync(`taskkill /F /PID ${pid}`); } catch (e) {}
          }
        }
      });
    } catch (e) {
      // No process found on this port, it's fine
    }
  });
}

console.log(chalk.bold.white('\n  🚀 Starting NovaPulse Services Orchestrator...\n'));

// 1. Clean up first
preStartCleanup();

console.log(chalk.gray(`  Logs are being saved to: ${LOG_FILE}\n`));

// 2. Start services
services.forEach(service => {
  const child = spawn(service.command, service.args, { 
    shell: true, 
    stdio: ['ignore', 'pipe', 'pipe'] 
  });

  children.push({ process: child, name: service.name });

  console.log(chalk[service.color](`  [✔] ${service.name.padEnd(25)} starting...`));

  child.stdout.on('data', (data) => {
    logStream.write(`[${service.name}] STDOUT: ${data}`);
  });

  child.stderr.on('data', (data) => {
    logStream.write(`[${service.name}] STDERR: ${data}`);
    if (data.toString().toLowerCase().includes('error')) {
      console.log(chalk.red(`  [!] ${service.name} reported an error (check services.log)`));
    }
  });

  child.on('error', (err) => {
    console.error(chalk.red(`  [✖] ${service.name} failed: ${err.message}`));
  });

  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.log(chalk.red(`  [✖] ${service.name} exited with code ${code}`));
    }
  });
});

console.log(chalk.cyan('\n  Orchestration complete! Access your dashboards at:'));
console.log(chalk.white('  - Main Dashboard: http://localhost:3020'));
console.log(chalk.white('  - MQTT Monitor:   http://localhost:3011\n'));
console.log(chalk.gray('  (Press Ctrl+C to stop all services)'));

function cleanup() {
  console.log(chalk.bold.red('\n  Stopping all services...'));
  
  children.forEach(child => {
    if (process.platform === 'win32') {
      try {
        execSync(`taskkill /F /T /PID ${child.process.pid}`);
      } catch (e) {}
    } else {
      child.process.kill();
    }
  });

  setTimeout(() => {
    console.log(chalk.green('  [✔] Cleanup finished. Bye!\n'));
    process.exit();
  }, 1000);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', () => {
  logStream.end();
});
