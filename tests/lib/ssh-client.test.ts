import { BrocadeSSHClient } from '../../src/lib/ssh-client';
import { Client } from 'ssh2';
import winston from 'winston';

jest.mock('ssh2');

describe('BrocadeSSHClient', () => {
  let mockClient: jest.Mocked<Client>;
  let sshClient: BrocadeSSHClient;
  let mockLogger: winston.Logger;

  beforeEach(() => {
    mockClient = {
      on: jest.fn().mockReturnThis(),
      connect: jest.fn(),
      exec: jest.fn(),
      end: jest.fn(),
    } as any;

    (Client as jest.MockedClass<typeof Client>).mockImplementation(() => mockClient);

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    sshClient = new BrocadeSSHClient(
      {
        host: 'test.host',
        port: 22,
        username: 'admin',
        password: 'password',
      },
      mockLogger
    );
  });

  describe('connect', () => {
    it('should establish SSH connection successfully', async () => {
      mockClient.on.mockImplementation((event, handler) => {
        if (event === 'ready') {
          process.nextTick(() => handler());
        }
        return mockClient;
      });

      await sshClient.connect();

      expect(mockClient.connect).toHaveBeenCalledWith({
        host: 'test.host',
        port: 22,
        username: 'admin',
        password: 'password',
        keepaliveInterval: 10000,
        readyTimeout: 30000,
      });
      expect(mockLogger.info).toHaveBeenCalledWith('SSH connection established');
    });

    it('should handle connection errors', async () => {
      const error = new Error('Connection failed');
      mockClient.on.mockImplementation((event, handler) => {
        if (event === 'error') {
          process.nextTick(() => handler(error));
        }
        return mockClient;
      });

      await expect(sshClient.connect()).rejects.toThrow('Connection failed');
      expect(mockLogger.error).toHaveBeenCalledWith('SSH connection error:', error);
    });
  });

  describe('executeCommand', () => {
    it('should execute command and return output', async () => {
      const mockStream = {
        on: jest.fn(),
        stderr: { on: jest.fn() },
      };

      mockClient.exec.mockImplementation((command, callback) => {
        callback(null, mockStream as any);
      });

      mockStream.on.mockImplementation((event, handler) => {
        if (event === 'data') {
          handler(Buffer.from('command output'));
        } else if (event === 'close') {
          handler(0);
        }
        return mockStream;
      });

      const result = await sshClient.executeCommand('show version');

      expect(result).toBe('command output');
      expect(mockClient.exec).toHaveBeenCalledWith('show version', expect.any(Function));
    });

    it('should handle command execution errors', async () => {
      mockClient.exec.mockImplementation((command, callback) => {
        callback(new Error('Execution failed'), null);
      });

      await expect(sshClient.executeCommand('show version')).rejects.toThrow('Execution failed');
    });

    it('should handle non-zero exit codes', async () => {
      const mockStream = {
        on: jest.fn(),
        stderr: { on: jest.fn() },
      };

      mockClient.exec.mockImplementation((command, callback) => {
        callback(null, mockStream as any);
      });

      mockStream.stderr.on.mockImplementation((event, handler) => {
        if (event === 'data') {
          handler(Buffer.from('error output'));
        }
        return mockStream.stderr;
      });

      mockStream.on.mockImplementation((event, handler) => {
        if (event === 'close') {
          handler(1);
        }
        return mockStream;
      });

      await expect(sshClient.executeCommand('invalid command')).rejects.toThrow(
        'Command failed with code 1: error output'
      );
    });
  });

  describe('executeMultipleCommands', () => {
    it('should execute multiple commands sequentially', async () => {
      const mockStream = {
        on: jest.fn(),
        stderr: { on: jest.fn() },
      };

      let commandIndex = 0;
      const outputs = ['output1', 'output2', 'output3'];

      mockClient.exec.mockImplementation((command, callback) => {
        callback(null, mockStream as any);
      });

      mockStream.on.mockImplementation((event, handler) => {
        if (event === 'data') {
          handler(Buffer.from(outputs[commandIndex]));
        } else if (event === 'close') {
          commandIndex++;
          handler(0);
        }
        return mockStream;
      });

      const commands = ['cmd1', 'cmd2', 'cmd3'];
      const results = await sshClient.executeMultipleCommands(commands);

      expect(results).toEqual(['output1', 'output2', 'output3']);
      expect(mockClient.exec).toHaveBeenCalledTimes(3);
    });
  });

  describe('disconnect', () => {
    it('should close SSH connection when connected', () => {
      // Simulate connected state
      mockClient.on.mockImplementation((event, handler) => {
        if (event === 'ready') {
          process.nextTick(() => handler());
        }
        return mockClient;
      });

      sshClient.connect();
      sshClient.disconnect();

      expect(mockClient.end).toHaveBeenCalled();
    });
  });
});