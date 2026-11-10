import { ConfigurationError } from './env.js';

export interface DeploymentConfig {
  origins: string[];
  proxyHops: number;
  poolSize: number;
  ssl: { rejectUnauthorized: true; ca?: string } | undefined;
  cloudinary: { cloudName: string; apiKey: string; apiSecret: string } | undefined;
}

export function parseDeployment(source: NodeJS.ProcessEnv): DeploymentConfig {
  const number = (name: string, fallback: number, max: number) => {
    const raw = source[name] ?? String(fallback);
    if (!/^\d+$/.test(raw) || Number(raw) > max) throw new ConfigurationError(`Revisa ${name}.`);
    return Number(raw);
  };
  const origins = (source.CORS_ORIGINS ?? (source.NODE_ENV === 'production' ? '' : 'http://localhost:8080,http://127.0.0.1:8080')).split(',').map((value) => value.trim()).filter(Boolean);
  for (const origin of origins) {
    let url: URL;
    try { url = new URL(origin); } catch { throw new ConfigurationError('Revisa CORS_ORIGINS.'); }
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) throw new ConfigurationError('CORS_ORIGINS debe contener orígenes exactos.');
  }
  const sslEnabled = source.DB_SSL === 'true';
  if (source.DB_SSL !== undefined && !['true', 'false'].includes(source.DB_SSL)) throw new ConfigurationError('DB_SSL debe ser true o false.');
  let ssl: DeploymentConfig['ssl'];
  if (sslEnabled) {
    ssl = { rejectUnauthorized: true };
    if (source.DB_SSL_CA_BASE64) {
      const ca = Buffer.from(source.DB_SSL_CA_BASE64, 'base64').toString('utf8');
      if (!ca.includes('-----BEGIN CERTIFICATE-----')) throw new ConfigurationError('Revisa el certificado DB_SSL_CA_BASE64.');
      ssl.ca = ca;
    }
  }
  const cloudName = source.CLOUDINARY_CLOUD_NAME;
  const apiKey = source.CLOUDINARY_API_KEY;
  const apiSecret = source.CLOUDINARY_API_SECRET;
  if ([cloudName, apiKey, apiSecret].some(Boolean) && ![cloudName, apiKey, apiSecret].every(Boolean)) throw new ConfigurationError('Completa las tres variables CLOUDINARY.');
  if (cloudName && !/^[a-zA-Z0-9_-]+$/.test(cloudName)) throw new ConfigurationError('Revisa CLOUDINARY_CLOUD_NAME.');
  const poolSize = number('DB_POOL_SIZE', 5, 100);
  if (poolSize < 1) throw new ConfigurationError('DB_POOL_SIZE debe ser positivo.');
  return { origins, proxyHops: number('TRUST_PROXY_HOPS', 0, 5), poolSize, ssl,
    cloudinary: cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : undefined };
}
