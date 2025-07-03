import { BrocadeSSHClient } from './ssh-client';
import { VlanInfo, InterfaceInfo, MacAddressEntry, RouteEntry, SystemInfo } from '../types';

export class BrocadeCommandExecutor {
  constructor(private sshClient: BrocadeSSHClient) {}

  async getSystemInfo(): Promise<SystemInfo> {
    const output = await this.sshClient.executeCommand('show version');

    const info: SystemInfo = {
      hostname: '',
      model: '',
      serialNumber: '',
      firmwareVersion: '',
      uptime: '',
    };

    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes('System Name:')) {
        info.hostname = line.split(':')[1]?.trim() || '';
      }
      if (line.includes('HW:')) {
        info.model = line.split('HW:')[1]?.split(',')[0]?.trim() || '';
      }
      if (line.includes('Serial:')) {
        info.serialNumber = line.split('Serial:')[1]?.trim() || '';
      }
      if (line.includes('SW:')) {
        info.firmwareVersion = line.split('SW:')[1]?.trim() || '';
      }
      if (line.includes('Uptime:')) {
        info.uptime = line.split('Uptime:')[1]?.trim() || '';
      }
    }

    return info;
  }

  async getVlans(): Promise<VlanInfo[]> {
    const output = await this.sshClient.executeCommand('show vlan');
    const vlans: VlanInfo[] = [];

    const lines = output.split('\n');

    for (const line of lines) {
      if (line.includes('PORT-VLAN')) {
        // Parse VLAN info from the same line
        const vlanMatch = line.match(/PORT-VLAN\s+(\d+),\s+Name\s+([^,]+)/);
        if (vlanMatch) {
          const vlan: VlanInfo = {
            id: parseInt(vlanMatch[1]),
            name: vlanMatch[2].trim(),
            ports: [],
            tagged: [],
            untagged: [],
          };
          vlans.push(vlan);
        }
      }
    }

    return vlans;
  }

  async getInterfaces(): Promise<InterfaceInfo[]> {
    const output = await this.sshClient.executeCommand('show interfaces brief');
    const interfaces: InterfaceInfo[] = [];

    const lines = output.split('\n');
    let inInterfaceSection = false;

    for (const line of lines) {
      if (line.includes('Port') && line.includes('Link')) {
        inInterfaceSection = true;
        continue;
      }

      if (inInterfaceSection && line.trim() && !line.includes('---')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          const iface: InterfaceInfo = {
            name: parts[0],
            status: parts[1]?.toLowerCase() === 'up' ? 'up' : 'down',
            speed: parts[2],
            duplex: parts[3],
          };
          interfaces.push(iface);
        }
      }
    }

    return interfaces;
  }

  async getMacAddressTable(): Promise<MacAddressEntry[]> {
    const output = await this.sshClient.executeCommand('show mac-address');
    const entries: MacAddressEntry[] = [];

    const lines = output.split('\n');
    for (const line of lines) {
      const macRegex = /([0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4})/;
      const match = line.match(macRegex);

      if (match) {
        const parts = line.trim().split(/\s+/);
        const entry: MacAddressEntry = {
          address: match[1],
          vlan: parseInt(parts[1]) || 1,
          port: parts[2] || '',
          type: parts[3]?.toLowerCase() === 'static' ? 'static' : 'dynamic',
        };
        entries.push(entry);
      }
    }

    return entries;
  }

  async getRoutingTable(): Promise<RouteEntry[]> {
    const output = await this.sshClient.executeCommand('show ip route');
    const routes: RouteEntry[] = [];

    const lines = output.split('\n');
    for (const line of lines) {
      const ipRegex = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2})/;
      const match = line.match(ipRegex);

      if (match) {
        const parts = line.trim().split(/\s+/);
        const route: RouteEntry = {
          destination: match[1],
          gateway: parts.find(p => p.match(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/) !== null) ?? '',
          interface: parts.find(p => p.includes('e') || p.includes('ve')) ?? '',
          metric: parseInt(parts.find(p => !isNaN(parseInt(p))) ?? '0'),
        };
        routes.push(route);
      }
    }

    return routes;
  }

  async configureVlan(vlanId: number, name?: string): Promise<void> {
    const commands = [
      'configure terminal',
      `vlan ${vlanId}`,
      name !== undefined && name !== '' ? `name ${name}` : '',
      'exit',
      'write memory',
    ].filter(cmd => cmd);

    await this.sshClient.executeMultipleCommands(commands);
  }

  async addPortToVlan(port: string, vlanId: number, tagged: boolean = false): Promise<void> {
    const commands = [
      'configure terminal',
      `vlan ${vlanId}`,
      tagged ? `tagged ${port}` : `untagged ${port}`,
      'exit',
      'write memory',
    ];

    await this.sshClient.executeMultipleCommands(commands);
  }

  async configureInterface(interfaceName: string, config: {
    description?: string;
    enabled?: boolean;
    speed?: string;
    duplex?: string;
  }): Promise<void> {
    const commands = ['configure terminal', `interface ${interfaceName}`];

    if (config.description !== undefined && config.description !== '') {
      commands.push(`port-name ${config.description}`);
    }
    if (config.enabled !== undefined) {
      commands.push(config.enabled ? 'enable' : 'disable');
    }
    if (config.speed !== undefined && config.speed !== '') {
      commands.push(`speed-duplex ${config.speed}`);
    }

    commands.push('exit', 'write memory');
    await this.sshClient.executeMultipleCommands(commands);
  }

  async saveConfiguration(): Promise<void> {
    await this.sshClient.executeCommand('write memory');
  }

  async reloadSwitch(confirm: boolean = false): Promise<void> {
    if (confirm) {
      await this.sshClient.executeCommand('reload');
    }
  }
}