const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const chalk = require('chalk');

const trafficService = require('./services/trafficService');
const environmentService = require('./services/environmentService');
const emergencyService = require('./services/emergencyService');

const delay = ms => new Promise(res => setTimeout(res, ms));

// FIX: coolPrint tidak menambahkan \n otomatis — caller yang atur newline
async function coolPrint(text, speed = 20) {
  for (let char of text) {
    process.stdout.write(char);
    await delay(speed);
  }
  // TIDAK ada \n di sini — biarkan caller yang kontrol
}

const PROTO_OPTIONS = {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
};

const trafficProtoPath = path.join(__dirname, '..', 'protos', 'traffic.proto');
const environmentProtoPath = path.join(__dirname, '..', 'protos', 'environment.proto');
const emergencyProtoPath = path.join(__dirname, '..', 'protos', 'emergency.proto');

const trafficProto = grpc.loadPackageDefinition(protoLoader.loadSync(trafficProtoPath, PROTO_OPTIONS));
const environmentProto = grpc.loadPackageDefinition(protoLoader.loadSync(environmentProtoPath, PROTO_OPTIONS));
const emergencyProto = grpc.loadPackageDefinition(protoLoader.loadSync(emergencyProtoPath, PROTO_OPTIONS));

function startServer() {
  const server = new grpc.Server();

  server.addService(trafficProto.citynexus.traffic.TrafficService.service, trafficService);
  server.addService(environmentProto.citynexus.environment.EnvironmentService.service, environmentService);
  server.addService(emergencyProto.citynexus.emergency.EmergencyService.service, emergencyService);

  const PORT = process.env.PORT || '50051';
  const address = `0.0.0.0:${PORT}`;

  server.bindAsync(address, grpc.ServerCredentials.createInsecure(), (err, port) => {
    if (err) {
      console.error(chalk.red('[ ✖ ] Failed to start server:'), err.message);
      process.exit(1);
    }

    (async () => {
      // ASCII ART BANNER
      const asciiLines = [
        '  ███╗   ██╗ ██████╗ ██╗   ██╗ █████╗ ██████╗ ██╗   ██╗██╗      ███████╗███████╗',
        '  ████╗  ██║██╔═══██╗██║   ██║██╔══██╗██╔══██╗██║   ██║██║      ██╔════╝██╔════╝',
        '  ██╔██╗ ██║██║   ██║██║   ██║███████║██████╔╝██║   ██║██║      ███████╗█████╗  ',
        '  ██║╚██╗██║██║   ██║╚██╗ ██╔╝██╔══██║██╔═══╝ ██║   ██║██║      ╚════██║██╔══╝  ',
        '  ██║ ╚████║╚██████╔╝ ╚████╔╝ ██║  ██║██║     ╚██████╔╝███████╗ ███████║███████╗',
        '  ╚═╝  ╚═══╝ ╚═════╝   ╚═══╝  ╚═╝  ╚═╝╚═╝      ╚═════╝ ╚══════╝ ╚══════╝╚══════╝',
      ];
      const asciiColors = [chalk.cyan, chalk.cyan, chalk.blue, chalk.blue, chalk.magenta, chalk.magenta];

      console.log('');
      asciiLines.forEach((line, i) => {
        console.log(asciiColors[i](line));
      });
      console.log(chalk.gray('  ' + '─'.repeat(80)));
      console.log(chalk.white.bold('                    ⚡ Smart City gRPC Nervous System  v1.0 ⚡'));
      console.log(chalk.gray('  ' + '─'.repeat(80)));
      console.log('');

      // PRE-START PROGRESS BAR
      console.log(chalk.cyan.bold('\n◈ INITIALIZING NOVAPULSE CORE...'));
      const bootSteps = [
        'Loading proto schemas',
        'Mounting gRPC services',
        'Synchronizing memory stores',
        'Starting AI Orchestrator'
      ];

      for (const step of bootSteps) {
        const width = 25;
        for (let i = 0; i <= width; i++) {
          const percent = i / width;
          const bar = '▰'.repeat(i) + '▱'.repeat(width - i);
          process.stdout.write(`\r  ${chalk.white(step.padEnd(30))} ${chalk.cyan(bar)} ${Math.round(percent * 100)}%`);
          await delay(20);
        }
        process.stdout.write(`\r  ${chalk.white(step.padEnd(30))} ${chalk.green('COMPLETE'.padEnd(25 + 6))}\n`);
        await delay(100);
      }

      // ── Box constants ──────────────────────────────────────────────────────
      // BOX_INNER = jumlah karakter visible di antara '║ ' dan ' ║'
      const BOX_INNER = 55;
      const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');

      const topBar = '╔' + '═'.repeat(BOX_INNER + 2) + '╗';
      const midBar = '╠' + '═'.repeat(BOX_INNER + 2) + '╣';
      const botBar = '╚' + '═'.repeat(BOX_INNER + 2) + '╝';

      // Helper: cetak satu baris di dalam kotak dengan coolPrint per karakter,
      // lalu tutup sisi kanan '║' di baris yang SAMA (tanpa \n ekstra).
      async function printBoxLine(coloredText, speed = 5) {
        const visibleLen = stripAnsi(coloredText).length;
        const pad = Math.max(0, BOX_INNER - visibleLen);

        process.stdout.write(chalk.blue('║ '));    // sisi kiri
        await coolPrint(coloredText, speed);       // teks (tanpa \n)
        process.stdout.write(' '.repeat(pad));     // padding sampai kolom kanan
        process.stdout.write(chalk.blue(' ║\n')); // sisi kanan + newline
      }

      // Helper: baris kosong di dalam kotak
      function printBoxEmpty() {
        process.stdout.write(chalk.blue('║ ') + ' '.repeat(BOX_INNER) + chalk.blue(' ║\n'));
      }

      // ── Render kotak ──────────────────────────────────────────────────────
      console.log(chalk.blue('\n' + topBar));

      // Title row
      await printBoxLine(chalk.cyan.bold('⚙  NovaPulse - Smart City gRPC Nervous System'), 20);

      console.log(chalk.blue(midBar));

      // Konten kotak — semua melalui printBoxLine agar padding selalu tepat
      const lines = [
        chalk.green('▶  Server: Online (Port ' + port + ')'),
        chalk.yellow.bold(' AI Orchestration: ENABLED'),
        '',
        chalk.magenta.bold('❖  Active Services:'),
        chalk.white('   ├── Traffic (Unary + Server Streaming)'),
        chalk.white('   ├── Environment (Unary + Bidi Streaming)'),
        chalk.white('   └── Emergency (Unary + Server Streaming)'),
        '',
        chalk.cyan.bold('▰  Available Commands:'),
        chalk.gray('   ├── npm run client:traffic'),
        chalk.gray('   ├── npm run client:environment'),
        chalk.gray('   ├── npm run client:emergency'),
        chalk.gray('   └── npm run client:dashboard'),
      ];

      for (const line of lines) {
        if (line === '') {
          printBoxEmpty();
          await delay(30);
        } else {
          await printBoxLine(line, 5);
          await delay(30);
        }
      }

      console.log(chalk.blue(botBar));
      console.log('');
    })();
  });
}

startServer();