import { fetchIpInfo } from './ip-language';

export interface ClientInfo {
  ip?: string;
  country?: string;
  city?: string;
  region?: string;
  timezone?: string;
  language?: string;
  userAgent: string;
  browserLanguage: string;
  screenResolution: string;
}

export async function collectClientInfo(): Promise<ClientInfo> {
  const ipData = await fetchIpInfo();
  return {
    ip: ipData?.ip,
    country: ipData?.country_name,
    city: ipData?.city,
    region: ipData?.region,
    timezone: ipData?.timezone,
    language: ipData?.country_code?.toLowerCase(),
    userAgent: navigator.userAgent,
    browserLanguage: navigator.language,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
  };
}

export async function sendClientInfo(info: ClientInfo): Promise<void> {
  try {
    await fetch('/api/client-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(info),
    });
  } catch (err) {
    console.error('Failed to send client info', err);
  }
}
