#!/usr/bin/env node

const readline = require('readline');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs-extra');

// Import site downloaders
const manningDownloader = require('./sites/manning');

const SUPPORTED_SITES = {
  'manning': {
    name: 'Manning Publications',
    downloader: manningDownloader
  }
};

// Simple input helper using readline
function askQuestion(question, hideInput = false) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    if (hideInput) {
      // Hide password input
      rl.stdoutMuted = true;
      rl._writeToOutput = function _writeToOutput(stringToWrite) {
        if (rl.stdoutMuted) {
          rl.output.write('*');
        } else {
          rl.output.write(stringToWrite);
        }
      };
    }

    rl.question(question, (answer) => {
      rl.close();
      if (hideInput) console.log(); // New line after password
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log(chalk.blue.bold('\n📚 Automated Ebook Downloader\n'));

  try {
    // For now, default to Manning (can be extended later)
    const site = 'manning';
    console.log(chalk.cyan(`Selected site: ${SUPPORTED_SITES[site].name}\n`));

    // Get credentials
    const email = await askQuestion('Enter your email: ');
    if (!email.includes('@')) {
      throw new Error('Please enter a valid email address');
    }

    const password = await askQuestion('Enter your password: ', true);
    if (!password) {
      throw new Error('Password cannot be empty');
    }

    // Create downloads directory
    const downloadsDir = path.join(__dirname, '..', 'downloads', site);
    await fs.ensureDir(downloadsDir);

    console.log(chalk.green(`\n🚀 Starting download from ${SUPPORTED_SITES[site].name}...\n`));

    // Run the appropriate downloader
    await SUPPORTED_SITES[site].downloader.download({
      email,
      password,
      downloadsDir
    });

    console.log(chalk.green.bold('\n✅ Download completed successfully!'));
    console.log(chalk.cyan(`📁 Files saved to: ${downloadsDir}`));

  } catch (error) {
    console.error(chalk.red.bold('\n❌ Error occurred:'), error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
