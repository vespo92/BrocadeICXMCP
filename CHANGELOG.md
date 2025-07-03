# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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