const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { chalk, withSpinner, prompt, rl, printHeader, coolPrint, animateValue, pulseMessage, shutdownSequence, bootSequence, printTable, drawAsciiChart, drawVerticalChart, drawSparkline, drawMatrix } = require('./ui');

const PROTO_PATH = path.join(__dirname, '..', 'protos', 'emergency.proto');
const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
});
const proto = grpc.loadPackageDefinition(packageDef);

const SERVER_ADDRESS = process.env.SERVER_ADDRESS || 'localhost:50060';
const client = new proto.citynexus.emergency.EmergencyService(
  SERVER_ADDRESS, grpc.credentials.createInsecure()
);

function printMenu() {
  const W = 38; // lebar konten visible — item terpanjang 35 char
  const strip = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');
  const row = (colored) => {
    const pad = W - strip(colored).length;
    return chalk.red('║ ') + colored + ' '.repeat(Math.max(0, pad)) + chalk.red(' ║');
  };

  console.log(chalk.red('╔' + '═'.repeat(W + 2) + '╗'));
  console.log(row(chalk.white.bold('EMERGENCY SERVICE OPERATIONS')));
  console.log(chalk.red('╠' + '═'.repeat(W + 2) + '╣'));
  console.log(row(chalk.white('[1] List active alerts')));
  console.log(row(chalk.white('[2] Create emergency alert')));
  console.log(row(chalk.white('[3] Get alert details')));
  console.log(row(chalk.white('[4] List all units')));
  console.log(row(chalk.white('[5] Dispatch unit to alert')));
  console.log(row(chalk.white('[6] Update unit status')));
  console.log(row(chalk.white('[7] Resolve alert')));
  console.log(row(chalk.yellow('[8] Subscribe to alerts (streaming)')));
  console.log(row(chalk.gray('[0] Exit')));
  console.log(chalk.red('╚' + '═'.repeat(W + 2) + '╝'));
}

async function listActiveAlerts() {
  try {
    const response = await withSpinner('Fetching active alerts...', new Promise((resolve, reject) => {
      client.ListActiveAlerts({}, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    }));

    const alerts = response.alerts || [];
    if (alerts.length === 0) {
      console.log(chalk.green('\n✔ OK No active alerts. All clear!'));
      return;
    }

    const headers = ['Alert ID', 'Type', 'Severity', 'Location', 'Status', 'Units'];
    const rows = alerts.map(a => {
      let sevClr = chalk.white;
      if (a.severity === 'LOW') sevClr = chalk.green;
      if (a.severity === 'MEDIUM') sevClr = chalk.yellow;
      if (a.severity === 'HIGH') sevClr = chalk.red;
      if (a.severity === 'CRITICAL') sevClr = chalk.bgRed.white;

      return [
        chalk.cyan(a.alert_id),
        chalk.magenta(a.type),
        sevClr(`[${a.severity}]`),
        chalk.white(a.location),
        chalk.yellow(a.status),
        chalk.white((a.assigned_units || []).length)
      ];
    });

    console.log(chalk.red(`\n  ▰ ACTIVE EMERGENCY ALERTS `));
    printTable(headers, rows, { borderColor: chalk.red });
  } catch (err) {
    console.log(chalk.red(`\n✖ ERROR ${err.message}`));
  }
}

async function createAlert() {
  const type = await prompt('Alert type (FIRE/MEDICAL/CRIME/NATURAL_DISASTER/HAZMAT/TRAFFIC_ACCIDENT): ');
  const severity = await prompt('Severity (LOW/MEDIUM/HIGH/CRITICAL): ');
  const location = await prompt('Location: ');
  const zone = await prompt('Zone (NORTH/SOUTH/CENTRAL/EAST/WEST): ');
  const desc = await prompt('Description: ');
  const name = await prompt('Reporter name: ');
  const contact = await prompt('Reporter contact: ');

  try {
    const response = await withSpinner('Creating alert...', new Promise((resolve, reject) => {
      client.CreateAlert({
        type: type.trim().toUpperCase(),
        severity: severity.trim().toUpperCase(),
        location: location.trim(),
        zone: zone.trim().toUpperCase(),
        description: desc.trim(),
        reporter_name: name.trim(),
        reporter_contact: contact.trim(),
        latitude: -6.2 + Math.random() * 0.1,
        longitude: 106.8 + Math.random() * 0.1,
      }, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    }));

    console.log(chalk.green(`\n✔ SUCCESS ${response.message}`));
    console.log(chalk.cyan(`  Alert ID: ${chalk.white(response.alert_id)}`));
  } catch (err) {
    console.log(chalk.red(`\n✖ ERROR ${err.message}`));
  }
}

async function getAlert() {
  const id = await prompt('Enter alert ID: ');
  try {
    const alert = await withSpinner(`Fetching alert ${id.trim()}...`, new Promise((resolve, reject) => {
      client.GetAlert({ alert_id: id.trim() }, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    }));

    let sevClr = chalk.white;
    if (alert.severity === 'LOW') sevClr = chalk.green;
    if (alert.severity === 'MEDIUM') sevClr = chalk.yellow;
    if (alert.severity === 'HIGH') sevClr = chalk.red;
    if (alert.severity === 'CRITICAL') sevClr = chalk.bgRed.white;

    console.log(chalk.red(`\n[ ALERT DETAILS: ${alert.alert_id} ]`));
    console.log(chalk.cyan(`  Type:        ${chalk.white(alert.type)}`));
    console.log(chalk.cyan(`  Severity:    ${sevClr(`[ ${alert.severity} ]`)}`));
    console.log(chalk.cyan(`  Location:    ${chalk.white(alert.location)}`));
    console.log(chalk.cyan(`  Zone:        ${chalk.white(alert.zone)}`));
    console.log(chalk.cyan(`  Description: ${chalk.white(alert.description)}`));
    console.log(chalk.cyan(`  Status:      ${chalk.white(alert.status)}`));
    console.log(chalk.cyan(`  Reporter:    ${chalk.white(alert.reporter_name)} (${chalk.white(alert.reporter_contact)})`));
    console.log(chalk.cyan(`  Units:       ${chalk.white((alert.assigned_units || []).join(', ') || 'None')}`));
    console.log(chalk.cyan(`  Created:     ${chalk.white(new Date(Number(alert.created_at)).toLocaleString())}`));
    
    if (alert.status === 'RESOLVED') {
      console.log(chalk.cyan(`  Resolved:    ${chalk.white(new Date(Number(alert.resolved_at)).toLocaleString())}`));
      console.log(chalk.cyan(`  Notes:       ${chalk.white(alert.resolution_notes)}`));
    }
  } catch (err) {
    console.log(chalk.red(`\n✖ ERROR ${err.message}`));
  }
}

async function listUnits() {
  try {
    const response = await withSpinner('Fetching units...', new Promise((resolve, reject) => {
      client.ListUnits({}, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    }));

    const headers = ['Unit ID', 'Name', 'Type', 'Status', 'Pers.', 'Current Alert'];
    const rows = (response.units || []).map(u => {
      let statClr = chalk.white;
      if (u.status === 'AVAILABLE') statClr = chalk.green;
      else if (u.status === 'DISPATCHED') statClr = chalk.yellow;
      else if (u.status === 'EN_ROUTE') statClr = chalk.magenta;
      else if (u.status === 'ON_SCENE') statClr = chalk.red;
      else if (u.status === 'RETURNING') statClr = chalk.blue;

      return [
        chalk.cyan(u.unit_id),
        chalk.white(u.name),
        chalk.magenta(u.type),
        statClr(`[${u.status}]`),
        chalk.yellow(u.personnel_count),
        chalk.gray(u.current_alert_id || '-')
      ];
    });

    console.log(chalk.green('\n  ◈ EMERGENCY RESPONSE UNITS '));
    printTable(headers, rows, { borderColor: chalk.blue });

    const personnelData = (response.units || []).map(u => {
      const parts = u.name.split(' ');
      const callsign = parts[parts.length - 1]; // "Alpha-1", "Bravo-2", etc.
      const shortType = u.type.substring(0, 3);
      const shortCall = callsign.replace('Alpha-', 'A').replace('Bravo-', 'B').replace('Charlie-', 'C').replace('Delta-', 'D').replace('Echo-', 'E');
      return {
        label: `${shortType}-${shortCall}`,
        value: u.personnel_count
      };
    });
    const maxPersonnel = Math.max(...personnelData.map(d => d.value), 1);
    drawVerticalChart(personnelData, { title: 'PERSONNEL DISTRIBUTION MATRIX (Vertical)', height: 8, maxValue: maxPersonnel });
  } catch (err) {
    console.log(chalk.red(`\n✖ ERROR ${err.message}`));
  }
}

async function dispatchUnit() {
  const alertId = await prompt('Alert ID: ');
  const unitId = await prompt('Unit ID: ');

  try {
    const response = await withSpinner('Dispatching unit...', new Promise((resolve, reject) => {
      client.DispatchUnit({
        alert_id: alertId.trim(),
        unit_id: unitId.trim(),
      }, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    }));

    console.log(chalk.green(`\n✔ SUCCESS ${response.message}`));
    console.log(chalk.cyan(`  ETA: ${chalk.white(response.estimated_arrival)}`));
  } catch (err) {
    console.log(chalk.red(`\n✖ ERROR ${err.message}`));
  }
}

async function updateUnitStatus() {
  const unitId = await prompt('Unit ID: ');
  const status = await prompt('New status (AVAILABLE/DISPATCHED/EN_ROUTE/ON_SCENE/RETURNING): ');
  const notes = await prompt('Notes (optional): ');

  try {
    const response = await withSpinner('Updating status...', new Promise((resolve, reject) => {
      client.UpdateUnitStatus({
        unit_id: unitId.trim(),
        status: status.trim().toUpperCase(),
        notes: notes.trim(),
        latitude: -6.2 + Math.random() * 0.1,
        longitude: 106.8 + Math.random() * 0.1,
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

async function resolveAlert() {
  const id = await prompt('Alert ID to resolve: ');
  const by = await prompt('Resolved by: ');
  const notes = await prompt('Resolution notes: ');

  try {
    const response = await withSpinner('Resolving alert...', new Promise((resolve, reject) => {
      client.ResolveAlert({
        alert_id: id.trim(),
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

async function subscribeAlerts() {
  const zone = await prompt('Zone (NORTH/SOUTH/CENTRAL/EAST/WEST/ALL): ');
  const minSev = await prompt('Min severity (LOW/MEDIUM/HIGH/CRITICAL): ');

  console.log(chalk.magenta(`\n▶ STREAM Subscribing to alerts for zone: ${chalk.white.bold(zone.toUpperCase() || 'ALL')}`));
  console.log(chalk.gray('(Press Enter to stop)\n'));

  const call = client.SubscribeAlerts({
    zone: zone.trim().toUpperCase() || 'ALL',
    min_severity: minSev.trim().toUpperCase() || 'LOW',
  });

  call.on('data', (event) => {
    const time = new Date(Number(event.timestamp)).toLocaleTimeString();
    
    let sevClr = chalk.white;
    if (event.severity === 'LOW') sevClr = chalk.green;
    if (event.severity === 'MEDIUM') sevClr = chalk.yellow;
    if (event.severity === 'HIGH') sevClr = chalk.red;
    if (event.severity === 'CRITICAL') sevClr = chalk.bgRed.white;

    let eventClr = chalk.blue;
    if (event.event_type === 'NEW_ALERT') eventClr = chalk.bgRed.white;

    console.log(chalk.gray(`[${time}]`) + ` ` + eventClr(`[${event.event_type}]`));
    console.log(chalk.cyan(`         ${sevClr(`[${event.severity}]`)} | ${event.alert_type} at ${event.location} (${event.zone})`));
    console.log(chalk.cyan(`         ${event.description}`));
    if (event.unit_name) console.log(chalk.magenta(`         Unit: ${chalk.white(event.unit_name)}`));
    console.log(chalk.gray('-'.repeat(60)));
  });

  call.on('error', (err) => {
    if (err.code !== grpc.status.CANCELLED) {
      console.log(chalk.red(`✖ STREAM ERROR ${err.message}`));
    }
  });

  call.on('end', () => {
    console.log(chalk.gray('⏹ STREAM ENDED'));
  });

  await prompt('\nPress Enter to stop subscription...');
  call.cancel();
  console.log(chalk.yellow('⏹ STREAM STOPPED'));
}

async function main() {
  await bootSequence('Emergency Dispatcher');
  printHeader('NovaPulse - Emergency Service Operations');

  while (true) {
    printMenu();
    const choice = await prompt('\n> Choose option: ');

    switch (choice.trim()) {
      case '1': await listActiveAlerts(); break;
      case '2': await createAlert(); break;
      case '3': await getAlert(); break;
      case '4': await listUnits(); break;
      case '5': await dispatchUnit(); break;
      case '6': await updateUnitStatus(); break;
      case '7': await resolveAlert(); break;
      case '8': await subscribeAlerts(); break;
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
