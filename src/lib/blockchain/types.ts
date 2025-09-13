export interface RpcResponse {
  content?: any;
  error?: any;
  _meta?: any;
}

export interface TokenData {
  mintAddress: string;
  bondingCurveAddress: string;
  solBalance: number;
  minterAddress: string;
  minterSolBalance: number;
  processSignature: string | null;
  isMalicious: boolean;
}