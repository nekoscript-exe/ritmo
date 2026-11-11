// Configuración de transporte compartida por React y la interfaz legacy.
// Solo configuración pública: VITE_* se incorpora al bundle, nunca incluir secretos.
export function resolveApiBase(value = '/api') {
  const base = value.trim().replace(/\/+$/, '');
  if (base.startsWith('/') && !base.startsWith('//') && !/[?#\\\s]/.test(base)) return base;
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('La API debe usar un prefijo del mismo origen o una URL HTTPS sin credenciales.');
  }
  return url.href.replace(/\/+$/, '');
}

const baseURL = resolveApiBase(import.meta.env?.VITE_API_BASE_URL || '/api');
export const apiConfig = {
  baseURL,
  timeoutMs: 15000,
  credentials: baseURL.startsWith('/') ? 'same-origin' : 'include',
};
