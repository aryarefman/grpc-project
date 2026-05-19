const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { chalk, withSpinner, prompt, rl, printHeader, drawProgressBar, coolPrint, animateValue, pulseMessage, shutdownSequence, bootSequence, printTable, drawAsciiChart, drawVerticalChart, drawSparkline, drawMatrix } = require('./ui');

const PROTO_PATH = path.join(__dirname, '..', 'protos', 'traffic.proto');
const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
});
const trafficProto = grpc.loadPackageDefinition(packageDef).citynexus.traffic;
const client = new trafficProto.TrafficService('localhost:50051', grpc.credentials.createInsecure());

function printMenu() {
  const W = 40; // lebar konten visible — item terpanjang 37 char
  const strip = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');
  const row = (colored) => {
    const pad = W - strip(colored).length;
    return chalk.blue('║ ') + colored + ' '.repeat(Math.max(0, pad)) + chalk.blue(' ║');
  };

  console.log(chalk.blue('╔' + '═'.repeat(W + 2) + '╗'));
  console.log(row(chalk.white.bold('TRAFFIC MANAGEMENT PROTOCOLS')));
  console.log(chalk.blue('╠' + '═'.repeat(W + 2) + '╣'));
  console.log(row(chalk.cyan('[1] List all intersections')));
  console.log(row(chalk.cyan('[2] Get specific intersection status')));
  console.log(row(chalk.cyan('[3] Update traffic light')));
  console.log(row(chalk.cyan('[4] Report incident')));
  console.log(row(chalk.cyan('[5] Get incident details')));
  console.log(row(chalk.cyan('[6] Resolve incident')));
  console.log(row(chalk.cyan('[7] Live monitoring (Stream)')));
  console.log(row(chalk.red('[0] Exit')));
  console.log(chalk.blue('╚' + '═'.repeat(W + 2) + '╝'));
}

async function listIntersections() {
  try {
    const response = await withSpinner('Fetching intersections...', new Promise((resolve, reject) => {
      client.ListIntersections({}, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    }));

    const headers = ['ID', 'Name', 'Zone', 'Light Status', 'Cars', 'Congestion Map', 'Status'];
    const rows = response.intersections.map(i => {
      const lightCol = i.current_light === 'GREEN' ? chalk.green : i.current_light === 'YELLOW' ? chalk.yellow : chalk.red;
      return [
        chalk.cyan(i.intersection_id),
        chalk.white(i.name),
        chalk.magenta(i.zone),
        lightCol(`[${i.current_light}]`),
        chalk.yellow(String(i.vehicle_count)),
        drawProgressBar(i.congestion_level, 1, 15),
        chalk.green(i.status)
      ];
    });

    console.log(chalk.green('\n  ❖ ALL INTERSECTIONS '));
    printTable(headers, rows, { borderColor: chalk.blue });

    // Vertical Chart for Intersections (Short labels)
    const chartData = response.intersections.map(i => {
      const shortName = i.name
        .replace('Jl. ', '')
        .replace('Sudirman', 'Sudir')
        .replace('Gatot Subroto', 'Gatot')
        .replace('MH Thamrin', 'Thamrn')
        .replace('Ahmad Yani', 'AYani')
        .replace('Diponegoro', 'Dipo')
        .replace('Mangga Dua', 'Mngga')
        .replace('Panglima Polim', 'Polim')
        .replace('Casablanca', 'Csblnc');

      return {
        label: shortName.substring(0, 8),
        value: i.vehicle_count
      };
    });
    drawVerticalChart(chartData, { title: 'VEHICLE DENSITY MATRIX (Vertical)', height: 8 });
  } catch (err) {
    console.log(chalk.red(`\n✖ ERROR ${err.message}`));
  }
}

async function getIntersectionStatus() {
  const id = await prompt('Enter intersection ID (e.g., INT-001): ');
  try {
    const i = await withSpinner('Querying core systems...', new Promise((resolve, reject) => {
      client.GetIntersectionStatus({ intersection_id: id.trim() }, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    }));

    console.log(chalk.green(`\n✔ STATUS: ${i.name} (${i.intersection_id})`));
    const statsHeaders = ['Metric', 'Current State'];
    const statsRows = [
        ['Zone', chalk.magenta(i.zone)],
        ['Light', (i.current_light === 'GREEN' ? chalk.green : i.current_light === 'YELLOW' ? chalk.yellow : chalk.red)(`[${i.current_light}]`)],
        ['Vehicles', chalk.yellow(i.vehicle_count)],
        ['Congestion', drawProgressBar(i.congestion_level, 1, 20)],
        ['Last Service', chalk.gray(new Date(Number(i.last_updated)).toLocaleString())]
    ];
    printTable(statsHeaders, statsRows, { borderColor: chalk.cyan });
  } catch (err) {
    console.log(chalk.red(`\n✖ ERROR ${err.message}`));
  }
}

async function updateTrafficLight() {
  const id = await prompt('Intersection ID: ');
  const light = await prompt('New light (RED/GREEN/YELLOW): ');
  const duration = await prompt('Duration (seconds): ');
  
  try {
    const res = await withSpinner('Transmitting override sig...', new Promise((resolve, reject) => {
      client.UpdateTrafficLight({
        intersection_id: id.trim(),
        new_light: light.trim().toUpperCase(),
        duration_seconds: parseInt(duration) || 60,
        reason: 'Manual override via Client Console',
      }, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    }));

    console.log(chalk.green(`\n✔ Light updated: [${res.previous_light}] -> [${res.current_light}]`));
    await pulseMessage(`NEW TIMEOUT: ${duration}s`, chalk.yellow);
  } catch (err) {
    console.log(chalk.red(`\n✖ ERROR ${err.message}`));
  }
}

async function reportIncident() {
  const id = await prompt('Intersection ID: ');
  const type = await prompt('Type (ACCIDENT/CONSTRUCTION/STALLED_VEHICLE): ');
  const desc = await prompt('Description: ');

  try {
    const res = await withSpinner('Reporting incident...', new Promise((resolve, reject) => {
      client.ReportIncident({
        intersection_id: id.trim(),
        type: type.trim().toUpperCase(),
        severity: 'HIGH',
        description: desc,
        reported_by: 'Traffic Management Console',
      }, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    }));

    console.log(chalk.green(`\n✔ Incident registered: ${res.incident_id}`));
    console.log(chalk.cyan(`  Status: ${chalk.white.bold(res.status || 'OPEN')}`));
  } catch (err) {
    console.log(chalk.red(`\n✖ ERROR ${err.message}`));
  }
}

async function resolveIncident() {
  const id = await prompt('Incident ID: ');
  const notes = await prompt('Resolution notes: ');
  const by = await prompt('Resolved by: ');

  try {
    const response = await withSpinner('Resolving incident...', new Promise((resolve, reject) => {
      client.ResolveIncident({
        incident_id: id.trim(),
        resolved_by: by.trim(),
        resolution_notes: notes.trim(),
      }, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    }));

    console.log(chalk.green(`\n✔ SUCCESS ${response.message}`));
  } catch (err) {
    console.log(chalk.red(`\n✖ ERROR ${err.message}`));
  }
}

async function monitorTraffic() {
  const zone = await prompt('Zone to monitor (NORTH/SOUTH/CENTRAL/EAST/WEST/ALL): ');
  console.log(chalk.yellow('\n📡 Monitoring live traffic updates (Press Enter to stop)...'));
  
  const call = client.MonitorTraffic({ zone: zone.trim().toUpperCase() || 'ALL' });
  let trafficHistory = [];

  call.on('data', (update) => {
    const timestamp = new Date().toLocaleTimeString();
    trafficHistory.push(update.vehicle_count);
    if(trafficHistory.length > 40) trafficHistory.shift();

    // Visual refresh feel
    process.stdout.write('\x1Bc'); 
    printHeader('LIVE TRAFFIC MONITOR: ' + (zone || 'ALL'));
    
    const eventColor = {
      INITIAL_STATE: chalk.blue,
      LIGHT_CHANGE: chalk.yellow,
      CONGESTION_UPDATE: chalk.magenta,
      INCIDENT: chalk.bgRed.white,
      VEHICLE_COUNT: chalk.cyan,
    }[update.event_type] || chalk.white;

    console.log(`[${chalk.gray(timestamp)}] ` + eventColor(`[${update.event_type}]`.padEnd(20)) + ` | ${chalk.white(update.name || update.intersection_id)}`);
    console.log(chalk.cyan(' Light: ') + (update.current_light === 'GREEN' ? chalk.green('GREEN ') : update.current_light === 'YELLOW' ? chalk.yellow('YELLOW') : chalk.red('RED   ')) + chalk.gray(' | ') + chalk.cyan('Cars: ') + chalk.white(String(update.vehicle_count).padEnd(4)) + chalk.gray(' | ') + chalk.cyan('Status: ') + chalk.white(update.status || 'N/A'));
    console.log(chalk.cyan(' Congestion: ') + drawProgressBar(update.congestion_level, 1, 30));
    
    drawSparkline(trafficHistory, { title: 'VEHICLE FLOW WAVEFORM', width: 40, height: 6 });
    console.log(chalk.gray('\n(Press Enter to stop monitoring)'));
  });

  call.on('error', (err) => {
    if (err.code !== grpc.status.CANCELLED) {
      console.log(chalk.red(`✖ STREAM ERROR ${err.message}`));
    }
  });

  await prompt('');
  call.cancel();
  console.log(chalk.yellow('⏹ STREAM STOPPED'));
}

async function getIncident() {
    const id = await prompt('Incident ID: ');
    try {
        const res = await withSpinner('Fetching incident details...', new Promise((resolve, reject) => {
            client.GetIncident({ incident_id: id.trim() }, (err, res) => {
                if (err) reject(err);
                else resolve(res);
            });
        }));
        console.log(chalk.green(`\n✔ INCIDENT DETAILS: ${res.incident_id}`));
        printTable(['Field', 'Value'], [
            ['Type', chalk.magenta(res.type)],
            ['Severity', chalk.red(res.severity)],
            ['Intersection', chalk.white(res.intersection_id)],
            ['Description', chalk.gray(res.description)],
            ['Status', chalk.yellow(res.status)]
        ]);
    } catch (err) {
        console.log(chalk.red(`\n✖ ERROR ${err.message}`));
    }
}

async function main() {
  await bootSequence('Traffic Service');
  printHeader('NovaPulse - Traffic Management Client');

  while (true) {
    printMenu();
    const choice = await prompt('\n> Choose option: ');

    switch (choice.trim()) {
      case '1': await listIntersections(); break;
      case '2': await getIntersectionStatus(); break;
      case '3': await updateTrafficLight(); break;
      case '4': await reportIncident(); break;
      case '5': await getIncident(); break;
      case '6': await resolveIncident(); break;
      case '7': await monitorTraffic(); break;
      case '0':
        await shutdownSequence();
        rl.close();
        process.exit(0);
      default:
        console.log(chalk.red('✖ ERROR Invalid option. Please try again.'));
    }
    console.log('');
  }
}

main().catch(err => {
  console.error(chalk.red(err));
});
