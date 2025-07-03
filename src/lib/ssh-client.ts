import { Client } from 'ssh2';
import { BrocadeConfig } from '../types';
import winston from 'winston';

export class BrocadeSSHClient {
  private client: Client;
  private config: BrocadeConfig;
  private logger: winston.Logger;
  private isConnected: boolean = false;

  constructor(config: BrocadeConfig, logger: winston.Logger) {
    this.config = config;
    this.logger = logger;
    this.client = new Client();
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client
        .on('ready', () => {
          this.isConnected = true;
          this.logger.info('SSH connection established');
          resolve();
        })
        .on('error', (err) => {
          this.logger.error('SSH connection error:', err);
          reject(err);
        })
        .on('close', () => {
          this.isConnected = false;
          this.logger.info('SSH connection closed');
        })
        .connect({
          host: this.config.host,
          port: this.config.port,
          username: this.config.username,
          password: this.config.password,
          keepaliveInterval: this.config.keepaliveInterval || 10000,
          readyTimeout: this.config.timeout || 30000,
        });
    });
  }

  async executeCommand(command: string): Promise<string> {
    if (!this.isConnected) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      this.client.exec(command, (err, stream) => {
        if (err) {
          this.logger.error(`Command execution error: ${err.message}`);
          reject(err);
          return;
        }

        let output = '';
        let errorOutput = '';

        stream
          .on('close', (code: number) => {
            if (code !== 0 && errorOutput) {
              reject(new Error(`Command failed with code ${code}: ${errorOutput}`));
            } else {
              resolve(output);
            }
          })
          .on('data', (data: Buffer) => {
            output += data.toString();
          })
          .stderr.on('data', (data: Buffer) => {
            errorOutput += data.toString();
          });
      });
    });
  }

  async executeMultipleCommands(commands: string[]): Promise<string[]> {
    const results: string[] = [];
    for (const command of commands) {
      const result = await this.executeCommand(command);
      results.push(result);
    }
    return results;
  }

  disconnect(): void {
    if (this.isConnected) {
      this.client.end();
      this.isConnected = false;
    }
  }
}