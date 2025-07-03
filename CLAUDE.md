# Claude Assistant Context for Brocade MCP Server

This document provides context and guidelines for AI assistants working on the Brocade MCP Server project.

## Project Overview

This project implements MCP (Model Context Protocol) servers for automating Brocade ICX 6450 switch management. It provides both stdio and SSE-based transports for interfacing with Brocade switches via SSH.

### Key Architecture Decisions

1. **SSH-based Communication**: Brocade ICX 6450 switches don't support REST APIs, so we use SSH to execute CLI commands
2. **Dual Transport Modes**: stdio for CLI integration, SSE for web-based real-time monitoring
3. **TypeScript**: Chosen for type safety and better IDE support
4. **Command Pattern**: Abstracted switch commands into high-level operations

## Development Guidelines

### Code Style

- Use TypeScript with strict mode enabled
- Follow existing patterns in the codebase
- Keep functions small and focused
- Use meaningful variable names
- Add JSDoc comments for public APIs
- No console.log in production code (use winston logger)

### Testing Requirements

Before committing any changes:
```bash
npm run lint
npm run typecheck
npm test
npm run build
```

### Adding New Features

1. **New Switch Commands**:
   - Add command logic to `src/lib/brocade-commands.ts`
   - Add type definitions to `src/types/index.ts`
   - Update both stdio and SSE servers with the new tool
   - Add corresponding tests

2. **Supporting New Switch Models**:
   - Research CLI differences for the model
   - Add model detection logic
   - Create model-specific command variations if needed
   - Document supported models in README

### Common Tasks

#### Adding a New MCP Tool

1. Define the Zod schema in the server files
2. Add the tool to the tools array
3. Implement the handler in the CallToolRequestSchema handler
4. Add the implementation to BrocadeCommandExecutor
5. Write tests for the new functionality

Example:
```typescript
// 1. Define schema
const ConfigurePortSecuritySchema = z.object({
  port: z.string(),
  maxMacAddresses: z.number().min(1).max(10),
  violation: z.enum(['shutdown', 'restrict', 'protect']),
});

// 2. Add to tools array
{
  name: 'configure_port_security',
  description: 'Configure port security settings',
  inputSchema: ConfigurePortSecuritySchema,
}

// 3. Implement handler
case 'configure_port_security':
  const securityArgs = ConfigurePortSecuritySchema.parse(args);
  await commandExecutor.configurePortSecurity(
    securityArgs.port,
    securityArgs.maxMacAddresses,
    securityArgs.violation
  );
  return {
    content: [{
      type: 'text',
      text: `Port security configured on ${securityArgs.port}`,
    }],
  };
```

#### Parsing Switch Output

When parsing CLI output:
1. Always handle edge cases (empty output, unexpected format)
2. Use regex carefully and test with various outputs
3. Add type guards for parsed data
4. Log warnings for unexpected formats

Example:
```typescript
async parseSpanningTree(output: string): Promise<SpanningTreeInfo[]> {
  const results: SpanningTreeInfo[] = [];
  const lines = output.split('\n');
  
  for (const line of lines) {
    // Handle various output formats
    if (line.includes('VLAN') && line.includes('is executing')) {
      // Parse STP info
    }
  }
  
  return results;
}
```

## Project Structure

```
src/
├── lib/              # Core libraries
│   ├── ssh-client.ts # SSH connection management
│   └── brocade-commands.ts # Command execution logic
├── servers/          # MCP server implementations
│   ├── stdio.ts      # CLI integration server
│   └── sse.ts        # Web integration server
└── types/            # TypeScript type definitions
```

## Known Limitations

1. **No REST API**: Must use SSH for all operations
2. **CLI Parsing**: Output format may vary between firmware versions
3. **Performance**: SSH operations are slower than REST
4. **Concurrent Operations**: Limited by SSH connection handling

## Security Considerations

1. Store credentials in environment variables
2. Never log passwords or sensitive data
3. Validate all input parameters
4. Use SSH key authentication when possible
5. Implement rate limiting for SSE server

## Testing Strategy

1. **Unit Tests**: Mock SSH client for command testing
2. **Integration Tests**: Use test switches when available
3. **Output Parsing**: Test with real command outputs
4. **Error Handling**: Test connection failures, timeouts

## Debugging Tips

1. Enable debug logging: `LOG_LEVEL=debug`
2. Test SSH connection manually first
3. Capture real switch outputs for testing
4. Use `execute_command` tool for troubleshooting

## Common Issues

### SSH Connection Failures
- Check network connectivity
- Verify credentials
- Ensure SSH is enabled on switch
- Check for firewall rules

### Command Parsing Errors
- Firmware version differences
- Privilege level requirements
- Command syntax variations

## Future Enhancements

1. **WebSocket Support**: Real-time bidirectional communication
2. **Bulk Operations**: Configure multiple switches
3. **Config Backup/Restore**: Full configuration management
4. **SNMP Integration**: For monitoring metrics
5. **Multi-vendor Support**: Extend to other switch brands

## Contributing

When contributing:
1. Follow the existing code patterns
2. Add tests for new features
3. Update documentation
4. Test with actual hardware when possible
5. Consider backward compatibility

## Resources

- [MCP Documentation](https://modelcontextprotocol.io/docs)
- [Brocade ICX Command Reference](https://docs.commscope.com/bundle/icx-8.0.x-commandref/page/GUID-F1A5A361-7395-4A59-B5B6-6E80B2E1B4C7.html)
- [SSH2 Node.js Documentation](https://github.com/mscdex/ssh2)

## AI Assistant Tips

1. **When adding features**: Always check existing patterns first
2. **When debugging**: Use the logger, not console.log
3. **When parsing output**: Handle edge cases and log warnings
4. **When writing tests**: Mock external dependencies
5. **When updating deps**: Run full test suite

Remember: This codebase values reliability and maintainability over clever solutions.