import { Client } from '@modelcontextprotocol/sdk/client';
import {
  StdioClientTransport,
} from '@modelcontextprotocol/sdk/client/stdio.js';

import { config } from '../../config/config';
import { logger } from '../utils/logger';
import { rateLimit } from '../utils/rateLimiter';
import { RpcResponse } from './types';

export class TatumClient {
  private client: Client;

  constructor() {
    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['@tatumio/blockchain-mcp'],
      env: {
        TATUM_API_KEY: config.tatumApiKey,
      },
    });

    this.client = new Client({
      name: 'solana_dbc_mint_detector',
      version: '1.0.0',
    });

    this.client.connect(transport).catch((error) => {
      logger.error('Failed to connect to Tatum MCP:', error);
      throw error;
    });
  }

  async callRpc(params: any): Promise<RpcResponse> {
    try {
      return await rateLimit(() => this.client.callTool(params));
    } catch (error) {
      logger.error('RPC call failed:', { params, error });
      throw error;
    }
  }
}