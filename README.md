# Brocade MCP Server

[![CI](https://github.com/vespo92/BrocadeICXMCP/actions/workflows/ci.yml/badge.svg)](https://github.com/vespo92/BrocadeICXMCP/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/brocade-mcp-server.svg)](https://nodejs.org)
[![MCP Protocol](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-blue)](https://modelcontextprotocol.io)

MCP (Model Context Protocol) servers for automating Brocade ICX 6450 switch management. This project provides both stdio and SSE-based MCP servers that interface with Brocade switches via SSH.

## Features

- **System Information**: Get switch model, firmware version, uptime, etc.
- **VLAN Management**: Create, configure, and manage VLANs
- **Interface Control**: Configure ports, view status, manage settings
- **Layer 2 Operations**: MAC address table management
- **Layer 3 Operations**: Routing table inspection
- **Raw CLI Access**: Execute any CLI command directly

## Architecture

Built with **TypeScript** and the **MCP SDK 1.18.2**, this server follows modern patterns for AI agent integration. Since Brocade ICX 6450 switches don't support REST APIs, the server uses SSH to execute CLI commands and parse the output.

### Transport Modes

1. **stdio**: For command-line integration with Claude Code and other CLI-based MCP clients
2. **SSE (Server-Sent Events)**: For web-based integration with real-time monitoring capabilities

### Modular Design

```
src/
├── core/              # Foundation libraries
│   ├── config.ts      # Zod-validated configuration
│   ├── errors.ts      # Custom error classes
│   └── logger.ts      # Winston logging utilities
├── lib/               # Core functionality
│   ├── ssh-client.ts  # Connection pooling & auto-reconnect
│   └── brocade-commands.ts # Command execution logic
├── mcp/               # MCP protocol implementation
│   ├── schemas.ts     # Zod schemas with JSON Schema generation
│   ├── tools.ts       # Tool definitions
│   ├── resources.ts   # Resource definitions
│   └── handlers.ts    # Shared request handlers
└── servers/           # Transport implementations
    ├── stdio.ts       # CLI transport
    └── sse.ts         # Web transport
```

### Key Features

- **TypeScript-first**: Full type safety with strict mode enabled
- **Schema validation**: Zod schemas automatically generate JSON schemas
- **Connection pooling**: Robust SSH connection management with auto-reconnect
- **Shared handlers**: Zero code duplication between transports
- **Structured logging**: Winston with contextual error tracking
- **Modern ESM**: Pure ES modules with NodeNext resolution

## Prerequisites

- Node.js 18+ 
- Access to a Brocade ICX 6450 switch via SSH
- SSH credentials for the switch

## Installation

### Option 1: Direct from GitHub (Recommended)

Using npx with MCP client:
```bash
npx -y github:vespo92/BrocadeICXMCP
```

### Option 2: Clone and Build

```bash
git clone https://github.com/vespo92/BrocadeICXMCP.git
cd BrocadeICXMCP
npm install
npm run build
```

### Option 3: GitHub Release

Download the latest release tarball from [Releases](https://github.com/vespo92/BrocadeICXMCP/releases):
```bash
tar -xzf brocade-mcp-server-v1.0.0.tar.gz
cd brocade-mcp-server
npm install --production
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

#### Using npx (Recommended)

Add to your `.mcp.json`:
```json
{
  "mcpServers": {
    "brocade": {
      "command": "npx",
      "args": ["-y", "github:vespo92/BrocadeICXMCP"],
      "env": {
        "BROCADE_HOST": "192.168.1.100",
        "BROCADE_USERNAME": "admin",
        "BROCADE_PASSWORD": "your_password"
      }
    }
  }
}
```

#### Using Local Clone

```json
{
  "mcpServers": {
    "brocade": {
      "command": "node",
      "args": ["/absolute/path/to/BrocadeICXMCP/dist/servers/stdio.js"],
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

## AI and Agent Integration

This project is designed for AI and agent-based automation:
- [CLAUDE.md](CLAUDE.md) - Context and guidelines for AI assistants
- [AI Agent Guide](docs/AI_AGENT_GUIDE.md) - Advanced patterns for autonomous agents

## Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to this project.

## License

MIT - See [LICENSE](LICENSE) for details