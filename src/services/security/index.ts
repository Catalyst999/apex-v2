export interface FullSecurityResult {
  mintAuthority: string | null;
  freezeAuthority: string | null;
  goplus: {
    isHoneypot: boolean;
  };
}
