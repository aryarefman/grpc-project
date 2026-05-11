const { spawn } = require('child_process');
const chalk = require('chalk');

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

console.log(chalk.bold.white('\n  🚀 Starting NovaPulse Services Silently...\n'));

services.forEach(service => {
  const child = spawn(service.command, service.args, { shell: true, stdio: 'ignore' });
  
  console.log(chalk[service.color](`  [✔] ${service.name} is now running in background`));

  child.on('error', (err) => {
    console.error(chalk.red(`  [✖] ${service.name} failed to start: ${err.message}`));
  });
});

console.log(chalk.cyan('\n  Everything is ready! Access your dashboards at:'));
console.log(chalk.white('  - Main Dashboard: http://localhost:3000'));
console.log(chalk.white('  - MQTT Monitor:   http://localhost:3001\n'));
console.log(chalk.gray('  (Press Ctrl+C to stop all services)'));

process.on('SIGINT', () => {
  console.log(chalk.bold.red('\n  Stopping all services...'));
  process.exit();
});
