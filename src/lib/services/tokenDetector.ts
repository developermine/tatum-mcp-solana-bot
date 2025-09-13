import fs from 'fs';

import { config } from '../../config/config';
import { TatumClient } from '../blockchain/client';
import {
  RpcResponse,
  TokenData,
} from '../blockchain/types';
import { logger } from '../utils/logger';

export class TokenDetector {
  private client: TatumClient;
  private chain: string;
  private programId: string;
  private excludedAddresses: Set<string>;
  private lastSignature: string | null = null;
  private processedSignatures: Set<string> = new Set();
  private basePollInterval: number = config.pollIntervalMs;
  private currentPollInterval: number = config.pollIntervalMs;

  constructor() {
    this.client = new TatumClient();
    this.chain = config.chain;
    this.programId = config.programId;
    this.excludedAddresses = config.excludedAddresses;
    this.loadState();
  }

  private loadState() {
    try {
      if (fs.existsSync('state.json')) {
        const state = JSON.parse(fs.readFileSync('state.json', 'utf8'));
        this.lastSignature = state.lastSignature || null;
        this.processedSignatures = new Set(state.processedSignatures || []);
        logger.info('Loaded state', {
          lastSignature: this.lastSignature,
          processedCount: this.processedSignatures.size,
        });
      }
    } catch (error) {
      logger.error('Failed to load state', { error });
    }
  }

  private saveState() {
    try {
      const state = {
        lastSignature: this.lastSignature,
        processedSignatures: Array.from(this.processedSignatures),
      };
      fs.writeFileSync('state.json', JSON.stringify(state, null, 2));
      logger.info('Saved state', { lastSignature: this.lastSignature });
    } catch (error) {
      logger.error('Failed to save state', { error });
    }
  }

  private getUnitDivisor(): number {
    switch (this.chain) {
      case 'solana-mainnet':
      case 'solana-devnet':
        return 1e9;
      default:
        logger.warn(`Unknown chain ${this.chain}; defaulting to 1`);
        return 1;
    }
  }

  private async parseRpcResponse(response: RpcResponse): Promise<any> {
    if (
      response.content &&
      Array.isArray(response.content) &&
      response.content[0]?.text
    ) {
      try {
        const outer = JSON.parse(response.content[0].text);
        if (!outer.success) {
          throw new Error(`Outer JSON error: ${outer.error || 'Unknown error'}`);
        }
        return JSON.parse(outer.data);
      } catch (error) {
        logger.error('Parse error:', { response, error });
        return null;
      }
    }
    logger.error('Invalid response structure:', { response });
    return null;
  }

  async pollNewTokens(): Promise<TokenData[]> {
    try {
      // Step 1: Get recent signatures
      const signaturesResp = await this.client.callRpc({
        name: 'gateway_execute_rpc',
        arguments: {
          chain: this.chain,
          method: 'getSignaturesForAddress',
          params: [
            this.programId,
            { limit: 10, before: this.lastSignature, commitment: 'confirmed' },
          ],
        },
      });

      const signaturesData = await this.parseRpcResponse(signaturesResp);
      const signatures = signaturesData?.data?.result || [];
      logger.info('Fetched signatures', { count: signatures.length });

      if (!signatures.length) {
        // Increase poll interval if no new signatures (up to 5 seconds)
        this.currentPollInterval = Math.min(this.currentPollInterval + 100, 5000);
        logger.info('No new signatures, adjusting poll interval', {
          interval: this.currentPollInterval,
        });
        return [];
      }

      // Reset poll interval to base when signatures are found
      this.currentPollInterval = this.basePollInterval;

      const newTokens: TokenData[] = [];
      for (const signatureInfo of signatures.reverse()) {
        //commented out for testing specific transactions
        const signature = signatureInfo.signature;

        // The below signature is for testing specific transactions, to see the mint address, bonding curve and other details
        // Uncomment and set to test specific transactions
        // const signature = "6qC6ZgqPhAegaAZmp7Ee9feGDVTP97ou4VaALCyKmPTKm8iQitVu9WBoeyT3tHxgDjpZpCmFDjca1uRWbQz5eAy"

        if (this.processedSignatures.has(signature)) {
          logger.info('Skipping already processed signature', { signature });
          continue;
        }

        // Step 2: Get transaction details
        const txResp = await this.client.callRpc({
          name: 'gateway_execute_rpc',
          arguments: {
            chain: this.chain,
            method: 'getTransaction',
            params: [
              signature,
              { commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
            ],
          },
        });

        const tx = await this.parseRpcResponse(txResp);
        if (!tx?.data?.result) {
          logger.warn('No transaction data found', { signature });
          this.processedSignatures.add(signature);
          continue;
        }

        // Early filtering: Check logs for token creation
        const logs = tx.data.result.meta?.logMessages || [];
        const hasInitializeLog = logs.some((log: string) =>
          log.includes('Instruction: InitializeVirtualPoolWithSplToken')
        );
        const hasCreateMetadataLog = logs.some((log: string) =>
          log.includes('create token metadata')
        );
        const hasMintToLog = logs.some((log: string) =>
          log.includes('Instruction: MintTo')
        );

        if (!(hasInitializeLog || hasCreateMetadataLog || hasMintToLog)) {
          logger.info('Not a token creation transaction', { signature });
          this.processedSignatures.add(signature);
          continue;
        }

        // Extract mint address
        const postTokenBalances = tx.data.result.meta?.postTokenBalances;
        const nonExcludedToken = postTokenBalances?.find(
          (balance: any) => !this.excludedAddresses.has(balance.mint)
        );
        const mintAddress = nonExcludedToken?.mint || '';
        if (!mintAddress) {
          logger.warn('No valid mint address found', { signature });
          this.processedSignatures.add(signature);
          continue;
        }

        // Step 3: Find bonding curve address and get balance
        let bondingCurveAddress = '';
        let solBalance = 0;
        const accountKeys = tx.data.result.transaction.message.accountKeys || [];
        const potentialAccounts = accountKeys.filter(
          (acc: string) => !this.excludedAddresses.has(acc)
        );

        const minterAddress = accountKeys[0];
        if (this.excludedAddresses.has(minterAddress)) {
          logger.warn('Minter address is excluded', { minterAddress });
          this.processedSignatures.add(signature);
          continue;
        }

        // Batch account info requests
        const accountInfoPromises = potentialAccounts.map(async (acc: string) => {
          const accInfoResp = await this.client.callRpc({
            name: 'gateway_execute_rpc',
            arguments: {
              chain: this.chain,
              method: 'getAccountInfo',
              params: [acc, { encoding: 'jsonParsed', commitment: 'confirmed' }],
            },
          });
          return { address: acc, data: await this.parseRpcResponse(accInfoResp) };
        });

        const accountInfos = await Promise.all(accountInfoPromises);
        for (const { address, data } of accountInfos) {
          if (data?.data?.result?.value?.space === 424) {
            bondingCurveAddress = address;
            const balanceResp = await this.client.callRpc({
              name: 'gateway_execute_rpc',
              arguments: {
                chain: this.chain,
                method: 'getBalance',
                params: [bondingCurveAddress, { commitment: 'confirmed' }],
              },
            });

            const balanceData = await this.parseRpcResponse(balanceResp);
            const currentBalanceRaw = balanceData?.data?.result?.value || 0;
            solBalance = currentBalanceRaw / this.getUnitDivisor();
            break;
          }
        }

        // Step 4: Get minter SOL balance
        let minterSolBalance = 0;
        if (minterAddress) {
          const minterBalanceResp = await this.client.callRpc({
            name: 'gateway_execute_rpc',
            arguments: {
              chain: this.chain,
              method: 'getBalance',
              params: [minterAddress, { commitment: 'confirmed' }],
            },
          });

          const minterBalanceData = await this.parseRpcResponse(minterBalanceResp);
          const minterBalanceRaw = minterBalanceData?.data?.result?.value || 0;
          minterSolBalance = minterBalanceRaw / this.getUnitDivisor();
        }

        // Step 5: Check if minter address is malicious
        let isMalicious = false;
        if (minterAddress) {
          const maliciousCheck = await this.client.callRpc({
            name: 'check_malicious_address',
            arguments: { address: minterAddress },
          });

          const maliciousData = await this.parseRpcResponse(maliciousCheck);
          isMalicious = maliciousData?.isMalicious || false;
        }

        const tokenData: TokenData = {
          mintAddress,
          bondingCurveAddress,
          solBalance,
          minterAddress,
          minterSolBalance,
          processSignature: signature,
          isMalicious,
        };

        logger.info('New token detected', tokenData);
        newTokens.push(tokenData);
        this.processedSignatures.add(signature);
      }

      // Update lastSignature to the newest signature
      this.lastSignature = signatures[0].signature;
      this.saveState();
      return newTokens;
    } catch (error) {
      logger.error('Error in pollNewTokens:', { error });
      // Increase poll interval on error to avoid hammering API
      this.currentPollInterval = Math.min(this.currentPollInterval + 100, 5000);
      return [];
    }
  }

  getPollInterval(): number {
    return this.currentPollInterval;
  }
}