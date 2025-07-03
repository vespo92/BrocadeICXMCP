import { BrocadeCommandExecutor } from '../../src/lib/brocade-commands';
import { BrocadeSSHClient } from '../../src/lib/ssh-client';
import { VlanInfo, InterfaceInfo } from '../../src/types';

jest.mock('../../src/lib/ssh-client');

describe('BrocadeCommandExecutor', () => {
  let mockSSHClient: jest.Mocked<BrocadeSSHClient>;
  let commandExecutor: BrocadeCommandExecutor;

  beforeEach(() => {
    mockSSHClient = {
      executeCommand: jest.fn(),
      executeMultipleCommands: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
    } as any;
    
    commandExecutor = new BrocadeCommandExecutor(mockSSHClient);
  });

  describe('getSystemInfo', () => {
    it('should parse system information correctly', async () => {
      const mockOutput = `
System Name: ICX6450-Switch
HW: ICX6450-48P, Serial: FWS1234567890
SW: 08.0.95d
Uptime: 15 days 23 hours 45 minutes
      `;

      mockSSHClient.executeCommand.mockResolvedValue(mockOutput);

      const result = await commandExecutor.getSystemInfo();

      expect(mockSSHClient.executeCommand).toHaveBeenCalledWith('show version');
      expect(result).toEqual({
        hostname: 'ICX6450-Switch',
        model: 'ICX6450-48P',
        serialNumber: 'FWS1234567890',
        firmwareVersion: '08.0.95d',
        uptime: '15 days 23 hours 45 minutes',
      });
    });
  });

  describe('getVlans', () => {
    it('should parse VLAN information correctly', async () => {
      const mockOutput = `
PORT-VLAN 1, Name DEFAULT-VLAN, Priority Level 0, Priority Force 0, Creation Type STATIC
Untagged Ports: 1 to 48
PORT-VLAN 100, Name GUEST, Priority Level 0, Priority Force 0, Creation Type STATIC
Untagged Ports: 10 to 20
      `;

      mockSSHClient.executeCommand.mockResolvedValue(mockOutput);

      const result = await commandExecutor.getVlans();

      expect(mockSSHClient.executeCommand).toHaveBeenCalledWith('show vlan');
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 1,
        name: 'DEFAULT-VLAN',
      });
      expect(result[1]).toMatchObject({
        id: 100,
        name: 'GUEST',
      });
    });
  });

  describe('configureVlan', () => {
    it('should execute correct commands to create VLAN', async () => {
      mockSSHClient.executeMultipleCommands.mockResolvedValue([]);

      await commandExecutor.configureVlan(200, 'Test-VLAN');

      expect(mockSSHClient.executeMultipleCommands).toHaveBeenCalledWith([
        'configure terminal',
        'vlan 200',
        'name Test-VLAN',
        'exit',
        'write memory',
      ]);
    });

    it('should create VLAN without name', async () => {
      mockSSHClient.executeMultipleCommands.mockResolvedValue([]);

      await commandExecutor.configureVlan(200);

      expect(mockSSHClient.executeMultipleCommands).toHaveBeenCalledWith([
        'configure terminal',
        'vlan 200',
        'exit',
        'write memory',
      ]);
    });
  });

  describe('addPortToVlan', () => {
    it('should add untagged port to VLAN', async () => {
      mockSSHClient.executeMultipleCommands.mockResolvedValue([]);

      await commandExecutor.addPortToVlan('ethernet 1/1/10', 100, false);

      expect(mockSSHClient.executeMultipleCommands).toHaveBeenCalledWith([
        'configure terminal',
        'vlan 100',
        'untagged ethernet 1/1/10',
        'exit',
        'write memory',
      ]);
    });

    it('should add tagged port to VLAN', async () => {
      mockSSHClient.executeMultipleCommands.mockResolvedValue([]);

      await commandExecutor.addPortToVlan('ethernet 1/1/10', 100, true);

      expect(mockSSHClient.executeMultipleCommands).toHaveBeenCalledWith([
        'configure terminal',
        'vlan 100',
        'tagged ethernet 1/1/10',
        'exit',
        'write memory',
      ]);
    });
  });

  describe('getInterfaces', () => {
    it('should parse interface information correctly', async () => {
      const mockOutput = `
Port   Link State  Dupl Speed  Trunk Tag Pvid Pri MAC
1/1/1  Up   Forward Full 1000M  None  No  1    0   cc4e.2415.0000
1/1/2  Down None    None None   None  No  1    0   cc4e.2415.0001
      `;

      mockSSHClient.executeCommand.mockResolvedValue(mockOutput);

      const result = await commandExecutor.getInterfaces();

      expect(mockSSHClient.executeCommand).toHaveBeenCalledWith('show interfaces brief');
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        name: '1/1/1',
        status: 'up',
        speed: 'Forward',
        duplex: 'Full',
      });
      expect(result[1]).toMatchObject({
        name: '1/1/2',
        status: 'down',
        speed: 'None',
        duplex: 'None',
      });
    });
  });
});