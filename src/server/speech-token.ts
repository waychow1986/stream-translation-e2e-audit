export interface SpeechToken {
  authorizationToken: string;
  expiresAt: string;
}

interface AccessToken {
  token: string;
  expiresOnTimestamp: number;
}

export class SpeechTokenProvider {
  private readonly resourceId: string;
  private readonly acquire: () => Promise<AccessToken>;
  private cached: SpeechToken | null = null;
  private refreshAt = 0;
  private refreshPromise: Promise<SpeechToken> | null = null;

  constructor(resourceId: string, acquire: () => Promise<AccessToken>) {
    this.resourceId = resourceId;
    this.acquire = acquire;
  }

  async getToken(): Promise<SpeechToken> {
    if (this.cached && Date.now() < this.refreshAt) return this.cached;
    if (!this.refreshPromise) {
      this.refreshPromise = this.refresh().finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  private async refresh(): Promise<SpeechToken> {
    const token = await this.acquire();
    this.cached = {
      authorizationToken: `aad#${this.resourceId}#${token.token}`,
      expiresAt: new Date(token.expiresOnTimestamp).toISOString()
    };
    this.refreshAt = token.expiresOnTimestamp - 5 * 60_000;
    return this.cached;
  }
}
