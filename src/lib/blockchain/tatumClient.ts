import { Client } from '@modelcontextprotocol/sdk/client';
import {
  StdioClientTransport,
} from '@modelcontextprotocol/sdk/client/stdio.js';

import { config } from '../../config/config.js';
import { logger } from '../utils/logger';
import { rateLimit } from '../utils/rateLimiter';
import { RpcResponse } from './types.js';

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

    this.connect(transport);
  }

  private async connect(transport: StdioClientTransport) {
    try {
      await this.client.connect(transport);
      logger.info('Connected to Tatum MCP Server');
    } catch (error) {
      logger.error('Failed to connect to Tatum MCP:', error);
      throw error;
    }
  }

  async callRpc(method: string, params: any[]): Promise<RpcResponse> {
    return rateLimit(async () => {
      try {
        const response = await this.client.callTool({
          name: 'gateway_execute_rpc',
          arguments: {
            chain: config.chain,
            method,
            params,
          },
        }) as any;
        return {
          content: response.content
            ? response.content.map((item: any) => ({
                text: item.text || item.content?.[0]?.text,
                type: item.type,
                _meta: item._meta,
                ...item,
              }))
            : undefined,
          error: response.error,
          _meta: response._meta,
        };
      } catch (error) {
        logger.error(`RPC call failed for ${method}:`, error);
        throw error;
      }
    });
  }

  async checkMaliciousAddress(address: string): Promise<boolean> {
    try {
      const response = await this.client.callTool({
        name: 'check_malicious_address',
        arguments: { address },
      }) as any;
      const data = await this.parseRpcResponse(response);
      return data?.isMalicious || false;
    } catch (error) {
      logger.error(`Malicious address check failed for ${address}:`, error);
      return false;
    }
  }

  async parseRpcResponse(response: RpcResponse): Promise<any> {
    if (
      response.content &&
      Array.isArray(response.content) &&
      response.content[0]?.text
    ) {
      try {
        const outer = JSON.parse(response.content[0].text);
        if (!outer.success) {
          throw new Error(`RPC error: ${outer.error || 'Unknown error'}`);
        }
        return JSON.parse(outer.data);
      } catch (error) {
        logger.error('Failed to parse RPC response:', error);
        return null;
      }
    }
    logger.error('Invalid RPC response structure:', response);
    return null;
  }
}