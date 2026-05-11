// ============================================================================
// NovaPulse MQTT - Dashboard Web Server
// Serves the monitoring dashboard on port 3001
// ============================================================================

const express = require('express');
const path = require('path');
const chalk = require('chalk');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log('');
  console.log(chalk.cyan.bold('  ╔══════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('  ║') + chalk.white.bold('   🌐 NovaPulse MQTT Dashboard Server               ') + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ╠══════════════════════════════════════════════════════╣'));
  console.log(chalk.cyan.bold('  ║') + chalk.green(`   ▶ Dashboard: http://localhost:${PORT}`.padEnd(51)) + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ║') + chalk.yellow(`   ▶ MQTT WS:   ws://localhost:9001`.padEnd(51)) + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ╚══════════════════════════════════════════════════════╝'));
  console.log('');
});
