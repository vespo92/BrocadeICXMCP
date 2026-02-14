export interface BrocadeConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  transport?: 'ssh' | 'telnet';
  enablePassword?: string;
  timeout?: number;
  keepaliveInterval?: number;
  maxRetries?: number;
  retryDelay?: number;
}

export interface VlanInfo {
  id: number;
  name: string;
  ports: string[];
  tagged: string[];
  untagged: string[];
}

export interface InterfaceInfo {
  name: string;
  status: 'up' | 'down';
  speed?: string;
  duplex?: string;
  vlan?: number;
  description?: string;
}

export interface MacAddressEntry {
  address: string;
  vlan: number;
  port: string;
  type: 'dynamic' | 'static';
}

export interface RouteEntry {
  destination: string;
  gateway: string;
  interface: string;
  metric?: number;
}

export interface SystemInfo {
  hostname: string;
  model: string;
  serialNumber: string;
  firmwareVersion: string;
  uptime: string;
}

// LLDP (Link Layer Discovery Protocol) types
export interface LLDPNeighbor {
  localPort: string;
  chassisId: string;
  portId: string;
  systemName: string;
  systemDescription?: string;
  portDescription?: string;
  managementAddress?: string;
  capabilities?: string[];
  vlan?: number;
}

export interface NetworkTopology {
  switches: {
    [chassisId: string]: {
      name: string;
      description?: string;
      managementIp?: string;
    };
  };
  connections: {
    localSwitch: string;
    localPort: string;
    remoteSwitch: string;
    remotePort: string;
  }[];
}

// Layer 2-3 types
export interface ArpEntry {
  ipAddress: string;
  macAddress: string;
  interface: string;
  age?: string;
  type: 'dynamic' | 'static';
}

export interface PortChannel {
  id: number;
  name?: string;
  type: 'static' | 'lacp';
  ports: string[];
  status: 'up' | 'down';
  loadBalancing?: string;
}

export interface Layer3Interface {
  name: string;
  vlan?: number;
  ipAddress?: string;
  subnet?: string;
  status: 'up' | 'down';
  mtu?: number;
}

export interface StaticRoute {
  destination: string;
  netmask: string;
  gateway: string;
  distance?: number;
  interface?: string;
}

export interface QoSProfile {
  name: string;
  priority?: number;
  dscp?: number;
  cos?: number;
  queueId?: number;
}

// Routing Protocol types
export interface BGPNeighbor {
  address: string;
  asn: number;
  state: string;
  uptime?: string;
  prefixReceived?: number;
  prefixSent?: number;
}

export interface OSPFNeighbor {
  routerId: string;
  priority: number;
  state: string;
  address: string;
  interface: string;
  deadTime?: string;
}

export interface RoutingProtocolStatus {
  bgp?: {
    enabled: boolean;
    asn?: number;
    routerId?: string;
    neighbors: BGPNeighbor[];
  };
  ospf?: {
    enabled: boolean;
    routerId?: string;
    areas: string[];
    neighbors: OSPFNeighbor[];
  };
}

// ACL/Firewall types
export interface ACLRule {
  sequence: number;
  action: 'permit' | 'deny';
  protocol: string;
  sourceIp?: string;
  sourceWildcard?: string;
  destIp?: string;
  destWildcard?: string;
  sourcePort?: string;
  destPort?: string;
  description?: string;
}

export interface ACL {
  name: string;
  type: 'standard' | 'extended';
  rules: ACLRule[];
}

export interface UpstreamRouting {
  defaultGateway?: string;
  primaryRoutes: RouteEntry[];
  bgpPeers?: BGPNeighbor[];
  ospfNeighbors?: OSPFNeighbor[];
  acls: ACL[];
}

// Switch Stacking types
export interface StackMember {
  unitId: number;
  macAddress: string;
  priority: number;
  role: 'master' | 'backup' | 'member' | 'standalone';
  state: 'local' | 'remote' | 'reserved';
  model: string;
  imageVersion?: string;
  uptime?: string;
}

export interface StackPort {
  unitId: number;
  portId: string;
  neighbor?: number;
  status: 'up' | 'down';
  speed?: string;
}

export interface StackTopology {
  stackId?: string;
  totalMembers: number;
  master: number;
  backup?: number;
  topology: 'ring' | 'chain' | 'standalone';
  members: StackMember[];
  stackPorts: StackPort[];
}

export interface StackConfiguration {
  unitId: number;
  priority?: number;
  stackPort?: {
    port1: string;
    port2?: string;
  };
  stackMac?: string;
}

// Security Features types
export interface DHCPSnoopingConfig {
  vlan: number;
  enabled: boolean;
  trustPorts?: string[];
}

export interface DHCPBinding {
  macAddress: string;
  ipAddress: string;
  vlan: number;
  interface: string;
  leaseTime?: string;
}

export interface IPSourceGuardConfig {
  port: string;
  enabled: boolean;
  maxBindings?: number;
}

export interface DynamicARPInspection {
  vlan: number;
  enabled: boolean;
  trustPorts?: string[];
  validateSrcMac?: boolean;
  validateDstMac?: boolean;
  validateIp?: boolean;
}

export interface PortSecurityStatus {
  port: string;
  enabled: boolean;
  maxMacAddresses: number;
  currentMacCount: number;
  violationMode: 'shutdown' | 'restrict' | 'protect';
  secureAddresses: string[];
}

// Advanced Monitoring types
export interface InterfaceStatistics {
  interface: string;
  status: 'up' | 'down';
  inputPackets: number;
  outputPackets: number;
  inputBytes: number;
  outputBytes: number;
  inputErrors: number;
  outputErrors: number;
  crcErrors: number;
  collisions: number;
  inputRate?: number;
  outputRate?: number;
  utilization?: number;
}

export interface SystemHealth {
  cpu: {
    current: number;
    average5min?: number;
    average1min?: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    utilization: number;
  };
  temperature?: {
    current: number;
    threshold?: number;
    status: 'normal' | 'warning' | 'critical';
  };
  fans?: {
    id: string;
    status: 'ok' | 'failed';
    speed?: number;
  }[];
  powerSupplies?: {
    id: string;
    status: 'ok' | 'failed' | 'absent';
    watts?: number;
  }[];
}

export interface CableDiagnostics {
  port: string;
  status: 'ok' | 'open' | 'short' | 'impedance-mismatch';
  pairs: {
    pair: number;
    status: 'ok' | 'open' | 'short';
    length?: number;
  }[];
}

export interface OpticalModuleInfo {
  port: string;
  present: boolean;
  type?: string;
  vendor?: string;
  serialNumber?: string;
  partNumber?: string;
  temperature?: number;
  voltage?: number;
  txPower?: number;
  rxPower?: number;
}