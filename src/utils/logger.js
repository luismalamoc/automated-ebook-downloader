const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');

class Logger {
  constructor() {
    this.logsDir = path.join(__dirname, '..', '..', 'logs');
    this.logFile = path.join(this.logsDir, `download-${new Date().toISOString().split('T')[0]}.log`);
    this.initializeLogFile();
  }

  async initializeLogFile() {
    try {
      await fs.ensureDir(this.logsDir);
      await fs.ensureFile(this.logFile);
    } catch (error) {
      console.error('Failed to initialize log file:', error.message);
    }
  }

  async writeToFile(level, message, data = null) {
    try {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        level,
        message,
        data
      };
      
      await fs.appendFile(this.logFile, JSON.stringify(logEntry) + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error.message);
    }
  }

  info(message, data = null) {
    console.log(chalk.blue('ℹ️ '), message);
    this.writeToFile('INFO', message, data);
  }

  success(message, data = null) {
    console.log(chalk.green('✅'), message);
    this.writeToFile('SUCCESS', message, data);
  }

  warning(message, data = null) {
    console.log(chalk.yellow('⚠️ '), message);
    this.writeToFile('WARNING', message, data);
  }

  error(message, error = null) {
    console.error(chalk.red('❌'), message);
    if (error) {
      console.error(chalk.red('   Stack:'), error.stack || error.message);
    }
    this.writeToFile('ERROR', message, error ? error.stack || error.message : null);
  }

  debug(message, data = null) {
    if (process.env.DEBUG) {
      console.log(chalk.gray('🐛'), message);
      this.writeToFile('DEBUG', message, data);
    }
  }
}

module.exports = new Logger();
