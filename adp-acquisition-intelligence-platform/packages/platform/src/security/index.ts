export type MalwareScanVerdict = 'allowed' | 'quarantined';

export type MalwareScanResult = {
  verdict: MalwareScanVerdict;
  reason: string | null;
  scannedAt: Date;
};

export type MalwareScanPort = {
  scan(input: {
    filename: string;
    contentType: string;
    bytes: Uint8Array;
  }): Promise<MalwareScanResult>;
};

export class AllowAllMalwareScanPort implements MalwareScanPort {
  async scan(): Promise<MalwareScanResult> {
    return { verdict: 'allowed', reason: null, scannedAt: new Date() };
  }
}

export class QuarantineMalwareScanPort implements MalwareScanPort {
  constructor(private readonly reason = 'quarantined_by_test_stub') {}

  async scan(): Promise<MalwareScanResult> {
    return { verdict: 'quarantined', reason: this.reason, scannedAt: new Date() };
  }
}
