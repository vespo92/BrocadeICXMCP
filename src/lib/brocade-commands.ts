import { BrocadeSSHClient } from './ssh-client.js';
import {
  VlanInfo,
  InterfaceInfo,
  MacAddressEntry,
  RouteEntry,
  SystemInfo,
  LLDPNeighbor,
  NetworkTopology,
  ArpEntry,
  PortChannel,
  Layer3Interface,
  StaticRoute,
  QoSProfile,
  BGPNeighbor,
  OSPFNeighbor,
  RoutingProtocolStatus,
  ACL,
  ACLRule,
  UpstreamRouting,
  StackMember,
  StackPort,
  StackTopology,
  DHCPSnoopingConfig,
  DHCPBinding,
  IPSourceGuardConfig,
  DynamicARPInspection,
  PortSecurityStatus,
  InterfaceStatistics,
  SystemHealth,
  CableDiagnostics,
  OpticalModuleInfo,
} from '../types/index.js';

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
          gateway: parts.find((p: string) => p.match(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/) !== null) ?? '',
          interface: parts.find((p: string) => p.includes('e') || p.includes('ve')) ?? '',
          metric: parseInt(parts.find((p: string) => !isNaN(parseInt(p))) ?? '0'),
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

  async saveConfig(): Promise<void> {
    await this.saveConfiguration();
  }

  async getRunningConfig(): Promise<string> {
    return await this.sshClient.executeCommand('show running-config');
  }

  async getStartupConfig(): Promise<string> {
    return await this.sshClient.executeCommand('show configuration');
  }

  async getLogs(maxLines: number = 100): Promise<string> {
    return await this.sshClient.executeCommand(`show logging | tail -${maxLines}`);
  }

  async getSpanningTree(): Promise<{ mode: string; instances: unknown[] }> {
    const output = await this.sshClient.executeCommand('show spanning-tree');
    // Parse spanning tree output
    const lines = output.split('\n');
    const result = {
      mode: 'unknown',
      instances: [] as unknown[],
    };

    for (const line of lines) {
      if (line.includes('Spanning tree mode:')) {
        result.mode = line.split(':')[1]?.trim().toLowerCase() || 'unknown';
      }
      // Additional parsing logic could be added here
    }

    return result;
  }

  async configureSpanningTree(mode: string, priority?: number): Promise<void> {
    const commands = ['configure terminal'];

    if (mode) {
      commands.push(`spanning-tree mode ${mode}`);
    }

    if (priority !== undefined) {
      commands.push(`spanning-tree priority ${priority}`);
    }

    commands.push('exit', 'write memory');
    await this.sshClient.executeMultipleCommands(commands);
  }

  async configurePortSecurity(port: string, maxMacAddresses: number, violation: string): Promise<void> {
    const commands = [
      'configure terminal',
      `interface ${port}`,
      'port security',
      `port security maximum ${maxMacAddresses}`,
      `port security violation ${violation}`,
      'exit',
      'write memory',
    ];

    await this.sshClient.executeMultipleCommands(commands);
  }

  async executeCommand(command: string): Promise<string> {
    return await this.sshClient.executeCommand(command);
  }

  async reloadSwitch(confirm: boolean = false): Promise<void> {
    if (confirm) {
      await this.sshClient.executeCommand('reload');
    }
  }

  // ========== LLDP Management ==========

  /**
   * Get LLDP neighbors
   */
  async getLLDPNeighbors(): Promise<LLDPNeighbor[]> {
    const output = await this.sshClient.executeCommand('show lldp neighbors detail');
    const neighbors: LLDPNeighbor[] = [];

    const blocks = output.split('Local port:').slice(1);

    for (const block of blocks) {
      const lines = block.split('\n');
      const neighbor: Partial<LLDPNeighbor> = {};

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('Local port:') || line.includes('Local port:')) {
          neighbor.localPort = trimmed.split(':')[1]?.trim() || lines[0]?.trim() || '';
        } else if (trimmed.includes('Chassis ID:')) {
          neighbor.chassisId = trimmed.split(':')[1]?.trim() || '';
        } else if (trimmed.includes('Port ID:')) {
          neighbor.portId = trimmed.split(':')[1]?.trim() || '';
        } else if (trimmed.includes('System Name:')) {
          neighbor.systemName = trimmed.split(':')[1]?.trim() || '';
        } else if (trimmed.includes('System Description:')) {
          neighbor.systemDescription = trimmed.split(':')[1]?.trim() || '';
        } else if (trimmed.includes('Port Description:')) {
          neighbor.portDescription = trimmed.split(':')[1]?.trim() || '';
        } else if (trimmed.includes('Management Address:')) {
          neighbor.managementAddress = trimmed.split(':')[1]?.trim() || '';
        } else if (trimmed.includes('Capabilities:')) {
          const caps = trimmed.split(':')[1]?.trim() || '';
          neighbor.capabilities = caps.split(',').map(c => c.trim());
        }
      }

      if (neighbor.localPort && neighbor.chassisId && neighbor.portId) {
        neighbors.push(neighbor as LLDPNeighbor);
      }
    }

    return neighbors;
  }

  /**
   * Get network topology from LLDP data
   */
  async getNetworkTopology(): Promise<NetworkTopology> {
    const neighbors = await this.getLLDPNeighbors();
    const systemInfo = await this.getSystemInfo();

    const topology: NetworkTopology = {
      switches: {},
      connections: [],
    };

    // Add local switch
    topology.switches['local'] = {
      name: systemInfo.hostname,
      description: `${systemInfo.model} - ${systemInfo.firmwareVersion}`,
    };

    // Add neighbors and connections
    for (const neighbor of neighbors) {
      topology.switches[neighbor.chassisId] = {
        name: neighbor.systemName,
        description: neighbor.systemDescription,
        managementIp: neighbor.managementAddress,
      };

      topology.connections.push({
        localSwitch: 'local',
        localPort: neighbor.localPort,
        remoteSwitch: neighbor.chassisId,
        remotePort: neighbor.portId,
      });
    }

    return topology;
  }

  /**
   * Configure LLDP settings
   */
  async configureLLDP(config: {
    enabled?: boolean;
    transmitInterval?: number;
    holdMultiplier?: number;
  }): Promise<void> {
    const commands = ['configure terminal'];

    if (config.enabled !== undefined) {
      commands.push(config.enabled ? 'lldp run' : 'no lldp run');
    }

    if (config.transmitInterval !== undefined) {
      commands.push(`lldp timer ${config.transmitInterval}`);
    }

    if (config.holdMultiplier !== undefined) {
      commands.push(`lldp holdtime-multiplier ${config.holdMultiplier}`);
    }

    commands.push('exit', 'write memory');
    await this.sshClient.executeMultipleCommands(commands);
  }

  // ========== Layer 2-3 Management ==========

  /**
   * Get ARP table
   */
  async getArpTable(): Promise<ArpEntry[]> {
    const output = await this.sshClient.executeCommand('show arp');
    const entries: ArpEntry[] = [];

    const lines = output.split('\n');
    for (const line of lines) {
      // Match IP and MAC address patterns
      const ipMatch = line.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
      const macMatch = line.match(/([0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4})/);

      if (ipMatch && macMatch) {
        const parts = line.trim().split(/\s+/);
        const entry: ArpEntry = {
          ipAddress: ipMatch[1],
          macAddress: macMatch[1],
          interface: parts.find(p => p.includes('ethernet') || p.includes('ve')) || 'unknown',
          age: parts.find(p => p.includes(':') || p.match(/\d+/)) || undefined,
          type: line.toLowerCase().includes('static') ? 'static' : 'dynamic',
        };
        entries.push(entry);
      }
    }

    return entries;
  }

  /**
   * Get port channels (LAG)
   */
  async getPortChannels(): Promise<PortChannel[]> {
    const output = await this.sshClient.executeCommand('show lag');
    const channels: PortChannel[] = [];

    const lines = output.split('\n');
    let currentChannel: Partial<PortChannel> | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // Match port-channel ID
      const lagMatch = trimmed.match(/LAG\s+(\d+)/i) || trimmed.match(/Port-channel\s+(\d+)/i);
      if (lagMatch) {
        if (currentChannel && currentChannel.id !== undefined) {
          channels.push(currentChannel as PortChannel);
        }

        currentChannel = {
          id: parseInt(lagMatch[1]),
          ports: [],
          status: trimmed.toLowerCase().includes('up') ? 'up' : 'down',
          type: trimmed.toLowerCase().includes('lacp') ? 'lacp' : 'static',
        };
      }

      // Match member ports
      if (currentChannel && trimmed.match(/ethernet\s+[\d/]+/i)) {
        const portMatch = trimmed.match(/ethernet\s+([\d/]+)/i);
        if (portMatch) {
          currentChannel.ports?.push(portMatch[1]);
        }
      }
    }

    if (currentChannel && currentChannel.id !== undefined) {
      channels.push(currentChannel as PortChannel);
    }

    return channels;
  }

  /**
   * Get Layer 3 interfaces (VEs)
   */
  async getLayer3Interfaces(): Promise<Layer3Interface[]> {
    const output = await this.sshClient.executeCommand('show ip interface');
    const interfaces: Layer3Interface[] = [];

    const lines = output.split('\n');

    for (const line of lines) {
      const veMatch = line.match(/ve\s+(\d+)/i);
      const ipMatch = line.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})/);

      if (veMatch) {
        const iface: Layer3Interface = {
          name: `ve${veMatch[1]}`,
          vlan: parseInt(veMatch[1]),
          status: line.toLowerCase().includes('up') ? 'up' : 'down',
        };

        if (ipMatch) {
          iface.ipAddress = ipMatch[1];
          iface.subnet = ipMatch[2];
        }

        interfaces.push(iface);
      }
    }

    return interfaces;
  }

  /**
   * Configure static route
   */
  async configureStaticRoute(route: StaticRoute): Promise<void> {
    const commands = ['configure terminal'];

    let routeCmd = `ip route ${route.destination} ${route.netmask} ${route.gateway}`;

    if (route.distance !== undefined) {
      routeCmd += ` ${route.distance}`;
    }

    commands.push(routeCmd, 'exit', 'write memory');
    await this.sshClient.executeMultipleCommands(commands);
  }

  /**
   * Configure port channel (LAG)
   */
  async configurePortChannel(config: {
    id: number;
    ports: string[];
    type?: 'static' | 'lacp';
    name?: string;
  }): Promise<void> {
    const commands = ['configure terminal'];

    // Create LAG
    commands.push(`lag ${config.id} ${config.type || 'static'}`);

    if (config.name) {
      commands.push(`port-name ${config.name}`);
    }

    // Add ports to LAG
    for (const port of config.ports) {
      commands.push(`ports ethernet ${port}`);
    }

    commands.push('exit', 'write memory');
    await this.sshClient.executeMultipleCommands(commands);
  }

  /**
   * Configure Layer 3 interface
   */
  async configureLayer3Interface(config: {
    vlan: number;
    ipAddress: string;
    subnet: string;
    description?: string;
  }): Promise<void> {
    const commands = [
      'configure terminal',
      `interface ve ${config.vlan}`,
    ];

    if (config.description) {
      commands.push(`port-name ${config.description}`);
    }

    commands.push(
      `ip address ${config.ipAddress}/${config.subnet}`,
      'exit',
      'write memory'
    );

    await this.sshClient.executeMultipleCommands(commands);
  }

  /**
   * Configure QoS profile
   */
  async configureQoS(config: QoSProfile): Promise<void> {
    const commands = ['configure terminal'];

    if (config.priority !== undefined) {
      commands.push(`qos priority ${config.priority}`);
    }

    if (config.dscp !== undefined) {
      commands.push(`qos dscp ${config.dscp}`);
    }

    commands.push('exit', 'write memory');
    await this.sshClient.executeMultipleCommands(commands);
  }

  // ========== Routing Protocol Management ==========

  /**
   * Get BGP neighbors
   */
  async getBGPNeighbors(): Promise<BGPNeighbor[]> {
    const output = await this.sshClient.executeCommand('show ip bgp neighbors');
    const neighbors: BGPNeighbor[] = [];

    const blocks = output.split('BGP neighbor is').slice(1);

    for (const block of blocks) {
      const lines = block.split('\n');
      const neighbor: Partial<BGPNeighbor> = {};

      for (const line of lines) {
        const trimmed = line.trim();

        // First line usually has the address
        if (!neighbor.address && trimmed.match(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/)) {
          const match = trimmed.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
          if (match) neighbor.address = match[1];
        }

        if (trimmed.includes('remote AS')) {
          const asnMatch = trimmed.match(/remote AS (\d+)/i);
          if (asnMatch) neighbor.asn = parseInt(asnMatch[1]);
        }

        if (trimmed.includes('BGP state')) {
          const stateMatch = trimmed.match(/BGP state = (\w+)/i);
          if (stateMatch) neighbor.state = stateMatch[1];
        }
      }

      if (neighbor.address && neighbor.asn) {
        neighbors.push({
          address: neighbor.address,
          asn: neighbor.asn,
          state: neighbor.state || 'unknown',
        });
      }
    }

    return neighbors;
  }

  /**
   * Get OSPF neighbors
   */
  async getOSPFNeighbors(): Promise<OSPFNeighbor[]> {
    const output = await this.sshClient.executeCommand('show ip ospf neighbor');
    const neighbors: OSPFNeighbor[] = [];

    const lines = output.split('\n');

    for (const line of lines) {
      const match = line.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+(\d+)\s+(\w+)\s+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+([\w/]+)/);

      if (match) {
        neighbors.push({
          routerId: match[1],
          priority: parseInt(match[2]),
          state: match[3],
          address: match[4],
          interface: match[5],
        });
      }
    }

    return neighbors;
  }

  /**
   * Get routing protocol status
   */
  async getRoutingProtocolStatus(): Promise<RoutingProtocolStatus> {
    const status: RoutingProtocolStatus = {};

    try {
      const bgpNeighbors = await this.getBGPNeighbors();
      if (bgpNeighbors.length > 0) {
        status.bgp = {
          enabled: true,
          neighbors: bgpNeighbors,
        };
      }
    } catch {
      // BGP not configured
    }

    try {
      const ospfNeighbors = await this.getOSPFNeighbors();
      if (ospfNeighbors.length > 0) {
        status.ospf = {
          enabled: true,
          areas: [],
          neighbors: ospfNeighbors,
        };
      }
    } catch {
      // OSPF not configured
    }

    return status;
  }

  // ========== ACL/Firewall Management ==========

  /**
   * Get ACL configuration
   */
  async getACLs(): Promise<ACL[]> {
    const output = await this.sshClient.executeCommand('show access-list');
    const acls: ACL[] = [];

    const blocks = output.split(/(?=(?:Standard|Extended) IP access list)/i);

    for (const block of blocks) {
      if (!block.trim()) continue;

      const lines = block.split('\n');
      const firstLine = lines[0];

      const aclMatch = firstLine.match(/(Standard|Extended) IP access list (\S+)/i);
      if (!aclMatch) continue;

      const acl: ACL = {
        name: aclMatch[2],
        type: aclMatch[1].toLowerCase() === 'standard' ? 'standard' : 'extended',
        rules: [],
      };

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const seqMatch = line.match(/^(\d+)\s+(permit|deny)\s+(.+)/i);
        if (seqMatch) {
          const rule: ACLRule = {
            sequence: parseInt(seqMatch[1]),
            action: seqMatch[2].toLowerCase() as 'permit' | 'deny',
            protocol: 'ip',
          };

          // Parse additional fields
          const parts = seqMatch[3].split(/\s+/);
          if (parts.length > 0) {
            rule.protocol = parts[0];
          }

          acl.rules.push(rule);
        }
      }

      acls.push(acl);
    }

    return acls;
  }

  /**
   * Configure ACL for firewall integration
   */
  async configureACL(config: {
    name: string;
    type: 'standard' | 'extended';
    rules: Omit<ACLRule, 'sequence'>[];
  }): Promise<void> {
    const commands = [
      'configure terminal',
      `ip access-list ${config.type} ${config.name}`,
    ];

    for (let i = 0; i < config.rules.length; i++) {
      const rule = config.rules[i];
      const seq = (i + 1) * 10;

      let ruleCmd = `${seq} ${rule.action} ${rule.protocol}`;

      if (rule.sourceIp) {
        ruleCmd += ` ${rule.sourceIp}`;
        if (rule.sourceWildcard) {
          ruleCmd += ` ${rule.sourceWildcard}`;
        }
      }

      if (rule.destIp) {
        ruleCmd += ` ${rule.destIp}`;
        if (rule.destWildcard) {
          ruleCmd += ` ${rule.destWildcard}`;
        }
      }

      commands.push(ruleCmd);
    }

    commands.push('exit', 'write memory');
    await this.sshClient.executeMultipleCommands(commands);
  }

  /**
   * Get upstream routing information for firewall integration
   */
  async getUpstreamRouting(): Promise<UpstreamRouting> {
    const routes = await this.getRoutingTable();
    const protocols = await this.getRoutingProtocolStatus();
    const acls = await this.getACLs();

    // Find default gateway
    const defaultRoute = routes.find(r =>
      r.destination === '0.0.0.0/0' || r.destination === '0.0.0.0'
    );

    return {
      defaultGateway: defaultRoute?.gateway,
      primaryRoutes: routes.filter(r => !r.destination.includes('0.0.0.0')),
      bgpPeers: protocols.bgp?.neighbors,
      ospfNeighbors: protocols.ospf?.neighbors,
      acls,
    };
  }

  // ========== Switch Stacking Management ==========

  /**
   * Get stack topology and member information
   */
  async getStackTopology(): Promise<StackTopology> {
    const output = await this.sshClient.executeCommand('show stack');
    const topology: StackTopology = {
      totalMembers: 0,
      master: 1,
      topology: 'standalone',
      members: [],
      stackPorts: [],
    };

    const lines = output.split('\n');
    let inMemberSection = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Detect standalone mode
      if (trimmed.includes('Stack is not configured') || trimmed.includes('standalone')) {
        topology.topology = 'standalone';
        topology.totalMembers = 1;
        continue;
      }

      // Detect topology type
      if (trimmed.includes('Topology:')) {
        const topoMatch = trimmed.match(/Topology:\s+(\w+)/i);
        if (topoMatch) {
          topology.topology = topoMatch[1].toLowerCase() as 'ring' | 'chain' | 'standalone';
        }
      }

      // Parse stack members
      if (trimmed.includes('Unit') && trimmed.includes('MAC') && trimmed.includes('Priority')) {
        inMemberSection = true;
        continue;
      }

      if (inMemberSection) {
        // Parse member line: Unit ID, MAC, Priority, Role, State, Model
        const memberMatch = trimmed.match(/^(\d+)\s+([0-9a-fA-F:.]+)\s+(\d+)\s+(\w+)\s+(\w+)\s+(.+)/i);
        if (memberMatch) {
          const member: StackMember = {
            unitId: parseInt(memberMatch[1]),
            macAddress: memberMatch[2],
            priority: parseInt(memberMatch[3]),
            role: memberMatch[4].toLowerCase() as 'master' | 'backup' | 'member' | 'standalone',
            state: memberMatch[5].toLowerCase() as 'local' | 'remote' | 'reserved',
            model: memberMatch[6].trim(),
          };

          topology.members.push(member);

          if (member.role === 'master') {
            topology.master = member.unitId;
          } else if (member.role === 'backup') {
            topology.backup = member.unitId;
          }
        }
      }
    }

    topology.totalMembers = topology.members.length || 1;

    // If no members found, create standalone entry
    if (topology.members.length === 0) {
      const systemInfo = await this.getSystemInfo();
      topology.members.push({
        unitId: 1,
        macAddress: 'unknown',
        priority: 128,
        role: 'standalone',
        state: 'local',
        model: systemInfo.model,
      });
    }

    return topology;
  }

  /**
   * Get stack ports status
   */
  async getStackPorts(): Promise<StackPort[]> {
    const output = await this.sshClient.executeCommand('show stack-port');
    const ports: StackPort[] = [];

    const lines = output.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Parse stack port lines
      // Example: "1  Stack1  2  Up  40G"
      const portMatch = trimmed.match(/^(\d+)\s+(\S+)\s+(\d+)?\s+(\w+)\s+(\S+)?/i);
      if (portMatch) {
        const port: StackPort = {
          unitId: parseInt(portMatch[1]),
          portId: portMatch[2],
          neighbor: portMatch[3] ? parseInt(portMatch[3]) : undefined,
          status: portMatch[4].toLowerCase() === 'up' ? 'up' : 'down',
          speed: portMatch[5],
        };
        ports.push(port);
      }
    }

    return ports;
  }

  /**
   * Get detailed information about a specific stack member
   */
  async getStackMember(unitId: number): Promise<StackMember | null> {
    const topology = await this.getStackTopology();
    return topology.members.find(m => m.unitId === unitId) || null;
  }

  /**
   * Configure stack priority for a unit
   */
  async configureStackPriority(unitId: number, priority: number): Promise<void> {
    const commands = [
      'configure terminal',
      `stack unit ${unitId}`,
      `priority ${priority}`,
      'exit',
      'write memory',
    ];

    await this.sshClient.executeMultipleCommands(commands);
  }

  /**
   * Configure stack ports
   */
  async configureStackPorts(config: {
    unitId: number;
    port1: string;
    port2?: string;
  }): Promise<void> {
    const commands = [
      'configure terminal',
      `stack unit ${config.unitId}`,
      `stack-port ${config.port1}`,
    ];

    if (config.port2) {
      commands.push(`stack-port ${config.port2}`);
    }

    commands.push('exit', 'write memory');
    await this.sshClient.executeMultipleCommands(commands);
  }

  /**
   * Renumber a stack unit
   */
  async renumberStackUnit(currentId: number, newId: number): Promise<void> {
    const commands = [
      'configure terminal',
      `stack unit ${currentId}`,
      `renumber ${newId}`,
      'exit',
      'write memory',
    ];

    await this.sshClient.executeMultipleCommands(commands);
  }

  /**
   * Enable or disable stack
   */
  async configureStack(enabled: boolean): Promise<void> {
    const commands = [
      'configure terminal',
      enabled ? 'stack enable' : 'stack disable',
      'exit',
      'write memory',
    ];

    await this.sshClient.executeMultipleCommands(commands);
  }

  /**
   * Get comprehensive stack health status
   */
  async getStackHealth(): Promise<{
    topology: StackTopology;
    ports: StackPort[];
    redundancy: {
      hasMaster: boolean;
      hasBackup: boolean;
      fullRedundancy: boolean;
    };
    connectivity: {
      ringComplete: boolean;
      allPortsUp: boolean;
      degradedLinks: number;
    };
  }> {
    const topology = await this.getStackTopology();
    const ports = await this.getStackPorts();

    const hasMaster = topology.members.some(m => m.role === 'master');
    const hasBackup = topology.members.some(m => m.role === 'backup');
    const allPortsUp = ports.length > 0 && ports.every(p => p.status === 'up');
    const degradedLinks = ports.filter(p => p.status === 'down').length;

    return {
      topology,
      ports,
      redundancy: {
        hasMaster,
        hasBackup,
        fullRedundancy: hasMaster && hasBackup && topology.totalMembers > 1,
      },
      connectivity: {
        ringComplete: topology.topology === 'ring' && allPortsUp,
        allPortsUp,
        degradedLinks,
      },
    };
  }

  // ========== Security Features ==========

  /**
   * Configure DHCP snooping
   */
  async configureDHCPSnooping(config: DHCPSnoopingConfig): Promise<void> {
    const commands = [
      'configure terminal',
      config.enabled ? 'ip dhcp snooping' : 'no ip dhcp snooping',
      `ip dhcp snooping vlan ${config.vlan}`,
    ];

    if (config.trustPorts && config.trustPorts.length > 0) {
      for (const port of config.trustPorts) {
        commands.push(
          `interface ethernet ${port}`,
          'ip dhcp snooping trust',
          'exit'
        );
      }
    }

    commands.push('exit', 'write memory');
    await this.sshClient.executeMultipleCommands(commands);
  }

  /**
   * Get DHCP snooping bindings
   */
  async getDHCPBindings(): Promise<DHCPBinding[]> {
    const output = await this.sshClient.executeCommand('show ip dhcp snooping binding');
    const bindings: DHCPBinding[] = [];

    const lines = output.split('\n');
    for (const line of lines) {
      // Parse binding entries
      const match = line.match(/([0-9a-fA-F:.]+)\s+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+(\d+)\s+(\S+)/);
      if (match) {
        bindings.push({
          macAddress: match[1],
          ipAddress: match[2],
          vlan: parseInt(match[3]),
          interface: match[4],
        });
      }
    }

    return bindings;
  }

  /**
   * Configure IP Source Guard
   */
  async configureIPSourceGuard(config: IPSourceGuardConfig): Promise<void> {
    const commands = [
      'configure terminal',
      `interface ethernet ${config.port}`,
      config.enabled ? 'ip verify source' : 'no ip verify source',
    ];

    if (config.maxBindings !== undefined && config.enabled) {
      commands.push(`ip verify source maximum ${config.maxBindings}`);
    }

    commands.push('exit', 'exit', 'write memory');
    await this.sshClient.executeMultipleCommands(commands);
  }

  /**
   * Configure Dynamic ARP Inspection
   */
  async configureDynamicARPInspection(config: DynamicARPInspection): Promise<void> {
    const commands = [
      'configure terminal',
      config.enabled ? `ip arp inspection vlan ${config.vlan}` : `no ip arp inspection vlan ${config.vlan}`,
    ];

    if (config.enabled) {
      if (config.validateSrcMac) {
        commands.push('ip arp inspection validate src-mac');
      }
      if (config.validateDstMac) {
        commands.push('ip arp inspection validate dst-mac');
      }
      if (config.validateIp) {
        commands.push('ip arp inspection validate ip');
      }

      if (config.trustPorts && config.trustPorts.length > 0) {
        for (const port of config.trustPorts) {
          commands.push(
            `interface ethernet ${port}`,
            'ip arp inspection trust',
            'exit'
          );
        }
      }
    }

    commands.push('exit', 'write memory');
    await this.sshClient.executeMultipleCommands(commands);
  }

  /**
   * Get port security status
   */
  async getPortSecurityStatus(port?: string): Promise<PortSecurityStatus[]> {
    const command = port ? `show port-security interface ethernet ${port}` : 'show port-security';
    const output = await this.sshClient.executeCommand(command);
    const statuses: PortSecurityStatus[] = [];

    const lines = output.split('\n');
    for (const line of lines) {
      // Parse port security status
      const match = line.match(/ethernet\s+([\d/]+)\s+(\w+)\s+(\d+)\s+(\d+)\s+(\w+)/i);
      if (match) {
        statuses.push({
          port: match[1],
          enabled: match[2].toLowerCase() === 'enabled',
          maxMacAddresses: parseInt(match[3]),
          currentMacCount: parseInt(match[4]),
          violationMode: match[5].toLowerCase() as 'shutdown' | 'restrict' | 'protect',
          secureAddresses: [],
        });
      }
    }

    return statuses;
  }

  // ========== Advanced Monitoring ==========

  /**
   * Get interface statistics
   */
  async getInterfaceStatistics(interfaceName?: string): Promise<InterfaceStatistics[]> {
    const command = interfaceName
      ? `show statistics ethernet ${interfaceName}`
      : 'show statistics';
    const output = await this.sshClient.executeCommand(command);
    const stats: InterfaceStatistics[] = [];

    const blocks = output.split(/(?=Port|Ethernet)/i);

    for (const block of blocks) {
      const lines = block.split('\n');
      const stat: Partial<InterfaceStatistics> = {};

      for (const line of lines) {
        const trimmed = line.trim();

        // Parse interface name
        if (trimmed.match(/^(?:Port|Ethernet)\s+([\d/]+)/i)) {
          const match = trimmed.match(/^(?:Port|Ethernet)\s+([\d/]+)/i);
          if (match) stat.interface = match[1];
        }

        // Parse statistics
        if (trimmed.includes('InOctets')) {
          const match = trimmed.match(/(\d+)/);
          if (match) stat.inputBytes = parseInt(match[1]);
        }
        if (trimmed.includes('InPkts') || trimmed.includes('Input packets')) {
          const match = trimmed.match(/(\d+)/);
          if (match) stat.inputPackets = parseInt(match[1]);
        }
        if (trimmed.includes('OutOctets')) {
          const match = trimmed.match(/(\d+)/);
          if (match) stat.outputBytes = parseInt(match[1]);
        }
        if (trimmed.includes('OutPkts') || trimmed.includes('Output packets')) {
          const match = trimmed.match(/(\d+)/);
          if (match) stat.outputPackets = parseInt(match[1]);
        }
        if (trimmed.includes('InErrors') || trimmed.includes('Input errors')) {
          const match = trimmed.match(/(\d+)/);
          if (match) stat.inputErrors = parseInt(match[1]);
        }
        if (trimmed.includes('OutErrors') || trimmed.includes('Output errors')) {
          const match = trimmed.match(/(\d+)/);
          if (match) stat.outputErrors = parseInt(match[1]);
        }
        if (trimmed.includes('CRC')) {
          const match = trimmed.match(/(\d+)/);
          if (match) stat.crcErrors = parseInt(match[1]);
        }
        if (trimmed.includes('Collisions')) {
          const match = trimmed.match(/(\d+)/);
          if (match) stat.collisions = parseInt(match[1]);
        }
      }

      if (stat.interface) {
        stats.push({
          interface: stat.interface,
          status: 'up',
          inputPackets: stat.inputPackets || 0,
          outputPackets: stat.outputPackets || 0,
          inputBytes: stat.inputBytes || 0,
          outputBytes: stat.outputBytes || 0,
          inputErrors: stat.inputErrors || 0,
          outputErrors: stat.outputErrors || 0,
          crcErrors: stat.crcErrors || 0,
          collisions: stat.collisions || 0,
        });
      }
    }

    return stats;
  }

  /**
   * Get system health
   */
  async getSystemHealth(): Promise<SystemHealth> {
    const cpuOutput = await this.sshClient.executeCommand('show cpu');
    const memOutput = await this.sshClient.executeCommand('show memory');

    const health: SystemHealth = {
      cpu: { current: 0 },
      memory: { total: 0, used: 0, free: 0, utilization: 0 },
    };

    // Parse CPU
    const cpuMatch = cpuOutput.match(/(\d+)%/);
    if (cpuMatch) {
      health.cpu.current = parseInt(cpuMatch[1]);
    }

    // Parse memory
    const memLines = memOutput.split('\n');
    for (const line of memLines) {
      if (line.includes('Total')) {
        const match = line.match(/(\d+)/);
        if (match) health.memory.total = parseInt(match[1]);
      }
      if (line.includes('Used')) {
        const match = line.match(/(\d+)/);
        if (match) health.memory.used = parseInt(match[1]);
      }
      if (line.includes('Free')) {
        const match = line.match(/(\d+)/);
        if (match) health.memory.free = parseInt(match[1]);
      }
    }

    if (health.memory.total > 0) {
      health.memory.utilization = Math.round((health.memory.used / health.memory.total) * 100);
    }

    // Try to get temperature
    try {
      const tempOutput = await this.sshClient.executeCommand('show chassis');
      const tempMatch = tempOutput.match(/Temperature:\s+(\d+)/i);
      if (tempMatch) {
        health.temperature = {
          current: parseInt(tempMatch[1]),
          status: parseInt(tempMatch[1]) > 70 ? 'warning' : 'normal',
        };
      }
    } catch {
      // Temperature monitoring may not be available
    }

    return health;
  }

  /**
   * Run cable diagnostics
   */
  async runCableDiagnostics(port: string): Promise<CableDiagnostics> {
    const output = await this.sshClient.executeCommand(`cable-diagnostics tdr interface ethernet ${port}`);

    const diagnostic: CableDiagnostics = {
      port,
      status: 'ok',
      pairs: [],
    };

    const lines = output.split('\n');
    for (const line of lines) {
      // Parse TDR results
      if (line.includes('Pair')) {
        const pairMatch = line.match(/Pair\s+(\d+):\s+(\w+)(?:\s+(\d+)\s*(?:m|meters)?)?/i);
        if (pairMatch) {
          diagnostic.pairs.push({
            pair: parseInt(pairMatch[1]),
            status: pairMatch[2].toLowerCase() as 'ok' | 'open' | 'short',
            length: pairMatch[3] ? parseInt(pairMatch[3]) : undefined,
          });

          if (pairMatch[2].toLowerCase() !== 'ok') {
            diagnostic.status = pairMatch[2].toLowerCase() as 'open' | 'short';
          }
        }
      }
    }

    return diagnostic;
  }

  /**
   * Get optical module information
   */
  async getOpticalModuleInfo(port?: string): Promise<OpticalModuleInfo[]> {
    const command = port ? `show optical-monitor ethernet ${port}` : 'show optical-monitor';
    const output = await this.sshClient.executeCommand(command);
    const modules: OpticalModuleInfo[] = [];

    const blocks = output.split(/(?=Port|Ethernet)/i);

    for (const block of blocks) {
      const lines = block.split('\n');
      const module: Partial<OpticalModuleInfo> = {};

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.match(/^(?:Port|Ethernet)\s+([\d/]+)/i)) {
          const match = trimmed.match(/^(?:Port|Ethernet)\s+([\d/]+)/i);
          if (match) module.port = match[1];
        }

        if (trimmed.includes('Transceiver')) {
          module.present = !trimmed.includes('Not Present');
        }

        if (trimmed.includes('Type:')) {
          const match = trimmed.match(/Type:\s+(.+)/);
          if (match) module.type = match[1].trim();
        }

        if (trimmed.includes('Vendor:')) {
          const match = trimmed.match(/Vendor:\s+(.+)/);
          if (match) module.vendor = match[1].trim();
        }

        if (trimmed.includes('Temperature')) {
          const match = trimmed.match(/([-\d.]+)\s*C/);
          if (match) module.temperature = parseFloat(match[1]);
        }

        if (trimmed.includes('TX Power') || trimmed.includes('Tx power')) {
          const match = trimmed.match(/([-\d.]+)\s*dBm/);
          if (match) module.txPower = parseFloat(match[1]);
        }

        if (trimmed.includes('RX Power') || trimmed.includes('Rx power')) {
          const match = trimmed.match(/([-\d.]+)\s*dBm/);
          if (match) module.rxPower = parseFloat(match[1]);
        }
      }

      if (module.port) {
        modules.push({
          port: module.port,
          present: module.present ?? false,
          type: module.type,
          vendor: module.vendor,
          temperature: module.temperature,
          txPower: module.txPower,
          rxPower: module.rxPower,
        });
      }
    }

    return modules;
  }
}