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