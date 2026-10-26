import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';

// API Base URL - use local backend or production
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Auth interceptor to add Bearer token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('userToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// In-flight deduplication and memory cache for idempotent GET requests
interface CacheEntry {
  data: unknown;
  timestamp: number;
}

const memoryCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<AxiosResponse>>();
const CACHE_TTL_MS = 15000; // 15 seconds TTL

export function invalidateApiCache(prefix?: string) {
  if (!prefix) {
    memoryCache.clear();
    return;
  }
  for (const key of memoryCache.keys()) {
    if (key.includes(prefix)) {
      memoryCache.delete(key);
    }
  }
}

// Response interceptor for error handling & mutation invalidation
api.interceptors.response.use(
  (response) => {
    const method = response.config.method?.toLowerCase();
    if (method && ['post', 'put', 'patch', 'delete'].includes(method)) {
      // Invalidate memory cache on any data mutation
      invalidateApiCache();
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('userToken');
      invalidateApiCache();
      window.dispatchEvent(new Event('auth:unauthorized'));
    }
    return Promise.reject(error);
  }
);

// Transparent in-flight deduplication & short-lived caching for GET requests
const originalGet = api.get.bind(api);

export interface CachedRequestConfig extends AxiosRequestConfig {
  skipCache?: boolean;
}

api.get = function <T = unknown, R = AxiosResponse<T>>(
  url: string,
  config?: CachedRequestConfig
): Promise<R> {
  const isNoCache =
    config?.headers?.['Cache-Control'] === 'no-cache' ||
    config?.headers?.['cache-control'] === 'no-cache' ||
    config?.skipCache;

  if (isNoCache) {
    return originalGet(url, config) as unknown as Promise<R>;
  }

  const cacheKey = `${url}?${JSON.stringify(config?.params || {})}`;

  // 1. Return fresh cached response if available
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return Promise.resolve({
      data: cached.data,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: config || {},
    } as unknown as R);
  }

  // 2. Reuse pending in-flight promise if an identical request is already active
  const inFlight = inFlightRequests.get(cacheKey);
  if (inFlight) {
    return inFlight as unknown as Promise<R>;
  }

  // 3. Dispatch fresh network request and store in cache
  const promise = originalGet(url, config)
    .then((res) => {
      memoryCache.set(cacheKey, { data: res.data, timestamp: Date.now() });
      return res;
    })
    .finally(() => {
      inFlightRequests.delete(cacheKey);
    });

  inFlightRequests.set(cacheKey, promise);
  return promise as unknown as Promise<R>;
};

export default api;
