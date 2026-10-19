import * as vscode from 'vscode';
import { DEFAULT_USER_AGENT } from './providers/scholar';
import { isProviderId, ProviderId } from './providers/types';

export interface Config {
  defaultProvider: ProviderId;
  keepProviderKeys: boolean;
  maxResults: number;
  userAgent: string;
}

export function readConfig(): Config {
  const c = vscode.workspace.getConfiguration('scholarBib');
  const provider = c.get<string>('defaultProvider');
  const maxResults = Math.round(c.get<number>('maxResults') ?? 10);
  return {
    defaultProvider: isProviderId(provider) ? provider : 'scholar',
    keepProviderKeys: c.get<string>('keyScheme') === 'provider' || c.get<boolean>('keepProviderKeys') === true,
    maxResults: Math.min(Math.max(maxResults, 1), 50),
    userAgent: c.get<string>('userAgent') || DEFAULT_USER_AGENT,
  };
}
