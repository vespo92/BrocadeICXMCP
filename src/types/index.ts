export interface BrocadeConfig {
  host: string;
  port: number;
  username: string;
  password: string;
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