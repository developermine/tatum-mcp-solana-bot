import dotenv from 'dotenv';

dotenv.config();

export const config = {
  chain: process.env.CHAIN || 'solana-mainnet',
  programId: process.env.PROGRAM_ID || 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN',
  excludedAddresses: new Set([
    'So11111111111111111111111111111111111111112',
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    '11111111111111111111111111111111',
    '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
    'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
    '42oMq7QR47GpFFH35GGaCbV7wsgnsXTy2KE7G3MxXEUH',
    'EhqBw92PqdPL5gJz428Qmfr76wUjRi1AWcXeg9yGBre',
    'uw1cVbU6E8J5qmswXwgo4K62eC7kRkGTfGaMVck6w9a',
    '8Ks12pbrD6PXxfty1hVQiE9sc289zgU1zHkvXhrSdriF',
    'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN',
    'FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM',
    'GWTUtJsEHYqest7WysPf5nNTuj4u15KQvC9BonZEVPSb',
  ]),
  tatumApiKey: process.env.TATUM_API_KEY || '',
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS) || 1000,
};