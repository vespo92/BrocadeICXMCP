# Brocade MCP Server

MCP (Model Context Protocol) servers for automating Brocade ICX 6450 switch management. This project provides both stdio and SSE-based MCP servers that interface with Brocade switches via SSH.

## Features

- **System Information**: Get switch model, firmware version, uptime, etc.
- **VLAN Management**: Create, configure, and manage VLANs
- **Interface Control**: Configure ports, view status, manage settings
- **Layer 2 Operations**: MAC address table management
- **Layer 3 Operations**: Routing table inspection
- **Raw CLI Access**: Execute any CLI command directly

## Architecture

Since Brocade ICX 6450 switches don't support REST APIs, this MCP server uses SSH to execute CLI commands and parse the output. The server provides two transport modes:

1. **stdio**: For command-line integration with Claude Code
2. **SSE (Server-Sent Events)**: For web-based integration with real-time monitoring capabilities

## Prerequisites

- Node.js 18+ 
- Access to a Brocade ICX 6450 switch via SSH
- SSH credentials for the switch

## Installation

```bash
npm install
npm run build
```

## Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Edit `.env` with your switch details:
```env
BROCADE_HOST=192.168.1.100
BROCADE_PORT=22
BROCADE_USERNAME=admin
BROCADE_PASSWORD=your_password_here
```

## Usage

### stdio Server

For integration with Claude Code:

```bash
npm run start:stdio
```

### SSE Server

For web-based integration:

```bash
npm run start:sse
```

The SSE server will start on port 3000 (configurable via `SSE_PORT`).

## Available Tools

### Information Gathering
- `get_system_info`: Retrieve system information
- `get_vlans`: List all configured VLANs
- `get_interfaces`: Get interface status and configuration
- `get_mac_table`: View MAC address table
- `get_routing_table`: Display IP routing table

### Configuration
- `configure_vlan`: Create or modify VLAN settings
- `add_port_to_vlan`: Assign ports to VLANs (tagged/untagged)
- `configure_interface`: Set interface parameters
- `execute_command`: Run raw CLI commands

### Monitoring (SSE only)
- `monitor_interface`: Real-time interface statistics

## Example Usage

### With Claude Code

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "brocade": {
      "command": "node",
      "args": ["path/to/dist/servers/stdio.js"],
      "env": {
        "BROCADE_HOST": "192.168.1.100",
        "BROCADE_USERNAME": "admin",
        "BROCADE_PASSWORD": "your_password"
      }
    }
  }
}
```

### Example Commands

Create a VLAN:
```typescript
await server.callTool('configure_vlan', {
  vlanId: 100,
  name: 'Guest-Network'
});
```

Add port to VLAN:
```typescript
await server.callTool('add_port_to_vlan', {
  port: 'ethernet 1/1/1',
  vlanId: 100,
  tagged: false
});
```

## Security Notes

- Store credentials securely using environment variables
- Use SSH key authentication when possible
- Limit MCP server access to trusted systems
- Consider network segmentation for management traffic

## Limitations

- Brocade ICX 6450 lacks native REST API support
- Performance depends on SSH connection quality
- Command parsing relies on CLI output format consistency
- Some operations may require elevated privileges

## Development

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Lint code
npm run lint

# Type check
npm run typecheck
```

## License

MIT