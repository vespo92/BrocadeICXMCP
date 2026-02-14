/**
 * Shared transport interface for Brocade switch communication.
 * Both SSH and Telnet clients implement this interface so
 * BrocadeCommandExecutor can use either one interchangeably.
 */

export interface BrocadeTransport {
  connect(): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;
  executeCommand(command: string, timeout?: number): Promise<string>;
  executeMultipleCommands(commands: string[], timeout?: number): Promise<string[]>;
  healthCheck(): Promise<boolean>;
}
