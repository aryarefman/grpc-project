const chalk = require('chalk');
const readline = require('readline');

const delay = ms => new Promise(res => setTimeout(res, ms));

const asciiSpinners = [
  '[    ]',
  '[=   ]',
  '[==  ]',
  '[=== ]',
  '[====]',
  '[ ===]',
  '[  ==]',
  '[   =]'
];

const gradientColors = [
  chalk.blue,
  chalk.cyan,
  chalk.green,
  chalk.yellow,
  chalk.magenta,
  chalk.red
];

function stripAnsi(str) {
    return str.replace(/\u001b\[.*?m/g, '');
}

async function withSpinner(text, promiseOrFn) {
  let i = 0;
  process.stdout.write('\x1B[?25l'); 
  const interval = setInterval(() => {
    process.stdout.write(`\r${gradientColors[i % gradientColors.length](asciiSpinners[i % asciiSpinners.length])} ${chalk.white(text)}`);
    i++;
  }, 80);

  try {
    const p = typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn;
    const [result] = await Promise.all([p, delay(1000)]); 
    clearInterval(interval);
    process.stdout.write(`\r${chalk.green('✔')} ${chalk.white(text)}\n`);
    process.stdout.write('\x1B[?25h'); 
    return result;
  } catch (error) {
    clearInterval(interval);
    process.stdout.write(`\r${chalk.red('✖')} ${chalk.white(text)}\n`);
    process.stdout.write('\x1B[?25h'); 
    throw error;
  }
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const prompt = (q) => new Promise(resolve => rl.question(chalk.yellow(q), resolve));

async function coolPrint(text, speed = 20) {
  for (let char of text) {
    process.stdout.write(char);
    await delay(speed);
  }
  process.stdout.write('\n');
}

function printHeader(title) {
  const top = '╔' + '═'.repeat(title.length + 4) + '╗';
  const mid = '║  ' + title + '  ║';
  const bot = '╚' + '═'.repeat(title.length + 4) + '╝';
  console.log('');
  console.log(chalk.blue.bold(top));
  console.log(chalk.blue.bold('║  ') + chalk.magenta.bold(title) + chalk.blue.bold('  ║'));
  console.log(chalk.blue.bold(bot));
  console.log('');
}

function drawProgressBar(current, total, width = 20) {
  const percent = Math.min(Math.max(current / total, 0), 1);
  const filledWidth = Math.max(0, Math.floor(percent * width));
  const emptyWidth = Math.max(0, width - filledWidth);
  
  let color = chalk.green;
  if(percent > 0.7) color = chalk.red;
  else if(percent > 0.4) color = chalk.yellow;

  const bar = color('█'.repeat(filledWidth)) + chalk.gray('░'.repeat(emptyWidth));
  return `[${bar}] ${Math.round(percent * 100)}%`;
}

async function animateProgressBar(label, current, total, width = 20) {
    const finalPercent = Math.min(Math.max(current / total, 0), 1);
    const targetWidth = Math.max(0, Math.floor(finalPercent * width));
    
    for (let i = 0; i <= targetWidth; i++) {
        const stepPercent = i / width;
        let color = chalk.green;
        if(stepPercent > 0.7) color = chalk.red;
        else if(stepPercent > 0.4) color = chalk.yellow;
        
        const bar = color('█'.repeat(i)) + chalk.gray('░'.repeat(width - i));
        const currentPct = Math.round((i / width) * 100);
        process.stdout.write(`\r  ${chalk.cyan(label.padEnd(21))} : [${bar}] ${currentPct}%   `);
        await delay(25);
    }
    process.stdout.write(`\r  ${chalk.cyan(label.padEnd(21))} : ${drawProgressBar(current, total, width)}   \n`);
}

async function animateValue(label, finalValue, unit = '', duration = 1000) {
    const steps = 15;
    const stepTime = duration / steps;
    const increment = finalValue / steps;
    let current = 0;

    for (let i = 0; i <= steps; i++) {
        let displayVal = finalValue % 1 === 0 ? Math.round(current) : current.toFixed(1);
        process.stdout.write(`\r${chalk.cyan(label)}: ${chalk.white.bold(displayVal)}${unit}    `);
        current += increment;
        if (current > finalValue) current = finalValue;
        await delay(stepTime);
    }
    process.stdout.write(`\r${chalk.cyan(label)}: ${chalk.white.bold(finalValue)}${unit}    \n`);
}

async function pulseMessage(message, colorFunc = chalk.cyan, repeats = 2) {
    for (let i = 0; i < repeats; i++) {
        process.stdout.write(`\r${colorFunc(message)}`);
        await delay(300);
        process.stdout.write(`\r${' '.repeat(message.length)}`);
        await delay(150);
    }
    process.stdout.write(`\r${colorFunc(message)}\n`);
}

async function taskSequence(tasks) {
    for (const task of tasks) {
        const width = 30;
        for (let j = 0; j <= width; j++) {
            const percent = j / width;
            const filled = Math.floor(percent * width);
            const bar = chalk.cyan('█').repeat(filled) + chalk.gray('░'.repeat(width - filled));
            const color = gradientColors[j % gradientColors.length];
            process.stdout.write(`\r${color('⚡')} ${chalk.white(task.padEnd(40))} [${bar}] ${Math.round(percent * 100)}%`);
            await delay(15);
        }
        process.stdout.write(`\r${chalk.green('✔')} ${chalk.white(task.padEnd(40))} [${chalk.green('█'.repeat(width))}] 100%\n`);
        await delay(100);
    }
}

async function bootSequence(clientName) {
    process.stdout.write('\x1B[?25l');
    console.log(chalk.cyan.bold(`\n◈ INITIALIZING ${clientName.toUpperCase()} INTERNAL CORE...`));
    const bootSteps = [
        `Connecting to NovaPulse Server`,
        `Handshaking gRPC channels`,
        `Loading UI components`,
        `System check ready`
    ];

    for (const step of bootSteps) {
        const width = 25;
        for (let i = 0; i <= width; i++) {
            const percent = i / width;
            const bar = '▰'.repeat(i) + '▱'.repeat(width - i);
            process.stdout.write(`\r  ${chalk.white(step.padEnd(30))} ${chalk.cyan(bar)} ${Math.round(percent * 100)}%`);
            await delay(15);
        }
        process.stdout.write(`\r  ${chalk.white(step.padEnd(30))} ${chalk.green('COMPLETE'.padEnd(25+6))}\n`);
    }
    process.stdout.write('\x1B[?25h');
}

async function shutdownSequence() {
    process.stdout.write('\x1B[?25l');
    console.log(chalk.yellow.bold('\n▰ SYSTEM SHUTDOWN INITIATED...'));
    
    await taskSequence([
        'Disconnecting from TrafficService',
        'Terminating Environment sensor nodes',
        'Clearing Emergency dispatch queues',
        'Releasing gRPC channel resources',
        'Saving session metadata'
    ]);

    console.log(chalk.red.bold('\nSYSTEM OFFLINE. BYE 👋\n'));
    process.stdout.write('\x1B[?25h');
}

function printTable(headers, rows, options = {}) {
    const colWidths = headers.map((h, i) => {
        let max = stripAnsi(h).length;
        rows.forEach(r => {
            const cell = stripAnsi(String(r[i]));
            if (cell.length > max) max = cell.length;
        });
        return max + 2;
    });

    const borderColor = options.borderColor || chalk.blue;
    const headerColor = options.headerColor || chalk.white.bold;
    
    let top = '╔';
    colWidths.forEach((w, i) => {
        top += '═'.repeat(w) + (i === colWidths.length - 1 ? '╗' : '╤');
    });
    console.log(borderColor(top));

    let headLine = '║';
    headers.forEach((h, i) => {
        const padding = colWidths[i] - stripAnsi(h).length;
        headLine += ' ' + headerColor(h) + ' '.repeat(padding - 1) + (i === headers.length - 1 ? borderColor('║') : borderColor('│'));
    });
    console.log(headLine);

    let sep = '╠';
    colWidths.forEach((w, i) => {
        sep += '═'.repeat(w) + (i === colWidths.length - 1 ? '╣' : '╪');
    });
    console.log(borderColor(sep));

    rows.forEach((row, rowIndex) => {
        let rowLine = '║';
        row.forEach((cell, i) => {
            const cellStr = String(cell);
            const padding = colWidths[i] - stripAnsi(cellStr).length;
            rowLine += ' ' + cellStr + ' '.repeat(padding - 1) + (i === row.length - 1 ? borderColor('║') : borderColor('│'));
        });
        console.log(rowLine);
    });

    let bottom = '╚';
    colWidths.forEach((w, i) => {
        bottom += '═'.repeat(w) + (i === colWidths.length - 1 ? '╝' : '╧');
    });
    console.log(borderColor(bottom));
}

function drawAsciiChart(data, options = {}) {
    const title = options.title || 'DATA VISUALIZATION';
    const maxValue = options.maxValue || Math.max(...data.map(d => d.value), 1);
    const chartWidth = options.width || 40;

    console.log(chalk.cyan.bold(`\n📊 ${title}`));
    console.log(chalk.gray('─'.repeat(chartWidth + 20)));

    data.forEach(item => {
        const ratio = Math.max(0, item.value / maxValue);
        const barWidth = Math.max(0, Math.floor(ratio * chartWidth));
        const barColor = ratio > 0.8 ? chalk.red : ratio > 0.5 ? chalk.yellow : chalk.green;
        const filledPart = '█'.repeat(barWidth);
        const emptyPart = '░'.repeat(Math.max(0, chartWidth - barWidth));
        const bar = barColor(filledPart) + chalk.gray(emptyPart);
        console.log(`${chalk.white(item.label.padEnd(15))} │ ${bar} ${chalk.cyan(String(item.value).padStart(5))}`);
    });
}

function drawVerticalChart(data, options = {}) {
    const title = options.title || 'RISK DISTRIBUTION';
    const height = options.height || 8;
    const maxValue = options.maxValue || 100; // Accept custom max value, default to 100%
    
    console.log(chalk.cyan.bold(`\n📶 ${title}`));
    console.log(chalk.gray('      ' + '┌' + '─'.repeat(data.length * 10)));

    for (let h = height; h >= 1; h--) {
        let line = chalk.gray(`${String(Math.round((h/height) * 100)).padStart(3)}% │ `);
        data.forEach(item => {
            const barHeight = (item.value / maxValue) * height;
            const color = item.value > 80 ? chalk.red : item.value > 50 ? chalk.yellow : chalk.green;
            line += barHeight >= h ? color('  ████  ') + '  ' : '        ' + '  ';
        });
        console.log(line);
    }
    console.log(chalk.gray('      ' + '└' + '─'.repeat(data.length * 10)));
    let labels = '         ';
    data.forEach(item => labels += chalk.white(item.label.padEnd(10)));
    console.log(labels + '\n');
}

/**
 * Draws a professional ASCII Sparkline (Waveform) for real-time data
 */
/**
 * Draws a professional Digital Area Chart for real-time waveform data
 */
function drawSparkline(data, options = {}) {
    const title = options.title || 'REAL-TIME SIGNAL';
    const height = options.height || 6;
    const width = options.width || 40;
    const maxValue = Math.max(...data, 50); // Scale relative to data, minimum 50
    
    // Ensure data length matches width with zero-padding
    const displayData = [...data];
    while(displayData.length < width) displayData.unshift(0);
    const chartData = displayData.slice(-width);

    console.log(chalk.cyan.bold(`\n📡 ${title}`));

    const top = '  ╔' + '═'.repeat(width + 2) + '╗';
    const bot = '  ╚' + '═'.repeat(width + 2) + '╝';
    
    console.log(chalk.blue(top));
    
    for (let h = height - 1; h >= 0; h--) {
        let row = '';
        chartData.forEach((val) => {
            const barHeight = (val / maxValue) * height;
            if (barHeight >= h + 1) {
                row += '█';
            } else if (barHeight >= h + 0.3) {
                row += '▄';
            } else {
                row += ' ';
            }
        });
        console.log(chalk.blue('  ║ ') + chalk.magenta(row) + chalk.blue(' ║'));
    }
    
    console.log(chalk.blue(bot));
}

/**
 * Draws a modern ASCII Dot/Heatmap Matrix
 */
/**
 * Draws a modern Sensor Status Matrix Dashboard
 * Now with real-time numeric readings
 */
function drawMatrix(data, options = {}) {
    const title = options.title || 'SENSOR STATUS MATRIX';
    const cols = options.cols || 2;
    const sensors = options.sensorNames || []; 
    const qualities = options.qualities || [];
    const values = options.values || [];

    console.log(chalk.cyan.bold(`\n❖ ${title}`));
    console.log(chalk.gray('  ' + '─'.repeat(60)));
    
    let output = '';
    sensors.forEach((name, i) => {
        const quality = qualities[i] || 'UNKNOWN';
        const valStr = values[i] || '';
        let statusLabel = ' OK ';
        let color = chalk.bgGreen.black;

        if (quality === 'HAZARDOUS' || quality === 'POOR' || quality === 'CRITICAL') {
            color = chalk.bgRed.white.bold;
            statusLabel = 'CRIT';
        } else if (quality === 'MODERATE' || quality === 'WARNING') {
            color = chalk.bgYellow.black;
            statusLabel = 'WARN';
        }
        
        const displayName = name.substring(0, 10).padEnd(10);
        output += `  ${chalk.white(displayName)} [${color(statusLabel)}] ${chalk.gray(valStr.padEnd(8))} `;
        
        if ((i + 1) % cols === 0) output += '\n';
    });

    console.log(output);
    console.log(chalk.gray('  ' + '─'.repeat(60)));
}

module.exports = {
  chalk,
  delay,
  withSpinner,
  prompt,
  rl,
  printHeader,
  coolPrint,
  drawProgressBar,
  animateValue,
  pulseMessage,
  bootSequence,
  shutdownSequence,
  taskSequence,
  printTable,
  drawAsciiChart,
  drawVerticalChart,
  drawSparkline,
  drawMatrix,
  animateProgressBar,
  stripAnsi,
  gradientColors
};
