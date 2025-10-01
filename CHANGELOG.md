# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **BREAKING**: Complete TypeScript modernization with MCP SDK 1.18.2
- Refactored architecture into modular structure (core/, lib/, mcp/, servers/)
- Migrated to ESM (ES Modules) with NodeNext resolution
- Replaced all Zod 4.x with Zod 3.25.76 for compatibility
- Implemented shared handlers eliminating code duplication between transports
- Updated to ESLint 9 with typescript-eslint flat config

### Added
- Zod-validated configuration management with sensible defaults
- Custom error classes (BrocadeError, SSHError, CommandError, ValidationError)
- Connection pooling with auto-reconnect and exponential backoff
- Health checks and keepalive for SSH connections
- Automatic JSON Schema generation from Zod schemas
- Winston structured logging with contextual error tracking
- GitHub-only distribution strategy (no npm publishing)
- `prepare` script for automatic builds on install

### Improved
- SSH client now includes retry logic and connection state management
- All MCP handlers properly typed with no 'any' usage
- Comprehensive type safety across entire codebase
- Enhanced error handling with proper MCP SDK error conversion
- Improved logging with correlation IDs and structured context

### Fixed
- TypeScript compilation with strict mode enabled
- ESLint warnings reduced to zero
- Import paths corrected for NodeNext module resolution
- Type annotations for all function parameters and returns

## [1.0.0] - 2025-01-03

### Added
- Initial release of Brocade MCP Server
- stdio-based MCP server for CLI integration
- SSE-based MCP server for web integration
- SSH client for Brocade ICX 6450 switch communication
- VLAN management capabilities (create, configure, port assignment)
- Interface configuration and status monitoring
- MAC address table viewing
- IP routing table inspection
- Raw CLI command execution
- Real-time interface monitoring (SSE server only)
- Comprehensive test suite
- CI/CD workflows with GitHub Actions
- TypeScript implementation with strict typing
- ESLint configuration for code quality
- Contributing guidelines and issue templates

### Security
- Secure credential management via environment variables
- SSH-based communication with configurable timeouts

[Unreleased]: https://github.com/vespo92/BrocadeICXMCP/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/vespo92/BrocadeICXMCP/releases/tag/v1.0.0