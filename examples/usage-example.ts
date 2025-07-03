import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

async function main() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/servers/stdio.js'],
    env: {
      ...process.env,
      BROCADE_HOST: '192.168.1.100',
      BROCADE_USERNAME: 'admin',
      BROCADE_PASSWORD: 'your_password',
    },
  });

  const client = new Client({
    name: 'brocade-example-client',
    version: '1.0.0',
  }, {
    capabilities: {},
  });

  await client.connect(transport);

  try {
    console.log('Getting system information...');
    const systemInfo = await client.callTool({
      name: 'get_system_info',
      arguments: {},
    });
    console.log('System Info:', systemInfo);

    console.log('\nGetting VLANs...');
    const vlans = await client.callTool({
      name: 'get_vlans',
      arguments: {},
    });
    console.log('VLANs:', vlans);

    console.log('\nCreating VLAN 200...');
    const createResult = await client.callTool({
      name: 'configure_vlan',
      arguments: {
        vlanId: 200,
        name: 'Test-VLAN',
      },
    });
    console.log('Create Result:', createResult);

    console.log('\nAdding port to VLAN...');
    const portResult = await client.callTool({
      name: 'add_port_to_vlan',
      arguments: {
        port: 'ethernet 1/1/10',
        vlanId: 200,
        tagged: false,
      },
    });
    console.log('Port Result:', portResult);

    console.log('\nConfiguring interface...');
    const ifaceResult = await client.callTool({
      name: 'configure_interface',
      arguments: {
        interfaceName: 'ethernet 1/1/10',
        description: 'Test Port',
        enabled: true,
      },
    });
    console.log('Interface Result:', ifaceResult);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await transport.close();
  }
}

main().catch(console.error);