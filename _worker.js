/**
 * =================================================================================
 * Cloudflare Worker for Secure and Cached Configuration Delivery
 *
 * Project: tvbox-free
 * Version: 2.0 (Refactored)
 *
 * Features:
 * - Advanced User-Agent validation with configurable regex patterns.
 * - Dynamic version extraction from User-Agent strings.
 * - Robust caching strategy using Stale-While-Revalidate (SWR).
 * - Resilient origin fetch with exponential backoff retries.
 * - Intelligent response encoding handling (BOM detection).
 * - Fully configurable via environment variables.
 * =================================================================================
 */

// ========== 1. 配置参数 (Configuration Parameters) ==========
const ENV_VARS = {
  JSON_CONFIG_URL: 'JSON_CONFIG_URL',       // REQUIRED: The URL of the upstream JSON config.
  UA_PATTERNS: 'UA_PATTERNS',             // OPTIONAL: Custom UA validation patterns.
  CACHE_MAX_AGE: 'CACHE_MAX_AGE',         // OPTIONAL: Cache max-age in seconds. Default: 3600.
  SWR_MAX_AGE: 'SWR_MAX_AGE',             // OPTIONAL: Stale-while-revalidate age in seconds. Default: 86400.
  REDIRECT_URL: 'REDIRECT_URL',           // OPTIONAL: URL to redirect to on failed UA validation. Default: https://www.google.com.
};

const DEFAULTS = {
  CACHE_MAX_AGE: 3600,
  SWR_MAX_AGE: 86400,
  REDIRECT_URL: 'https://www.google.com',
  // Default UA patterns allow 'okhttp' clients.
  UA_PATTERNS: [
    {
      pattern: 'okhttp\\/([\\d\\.]+)', // Captures version like 4.9.3
      type: 'okhttp',
      description: 'OkHttp library with version'
    },
    {
      pattern: 'okhttp',
      type: 'okhttp-legacy',
      description: 'Legacy OkHttp without version'
    }
  ],
};

/**
 * =================================================================================
 * Main Export - Worker Entry Point
 * =================================================================================
 */
export default {
  async fetch(request, env, ctx) {
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    console.log(`[Worker] Request from IP: ${clientIP}`);

    // Step 1: Handle User-Agent validation.
    const uaValidationResult = await handleUaValidation(request, env);
    if (!uaValidationResult.isValid) {
      const redirectUrl = env[ENV_VARS.REDIRECT_URL] || DEFAULTS.REDIRECT_URL;
      console.log(`[Worker] ❌ UA validation failed. Redirecting to: ${redirectUrl}`);
      return Response.redirect(redirectUrl, 302);
    }

    console.log(`[Worker] ✅ UA validation passed for client: ${uaValidationResult.clientType} (Version: ${uaValidationResult.version})`);

    // Step 2: Fetch the configuration from cache or origin.
    try {
      const configResponse = await fetchAndCacheConfig(env, ctx);
      return configResponse;
    } catch (error) {
      console.error('[Worker] Fatal error during config fetch:', error.message, error.stack);
      // As a last resort, try to serve a stale response from cache.
      const staleResponse = await caches.default.match(new Request(env[ENV_VARS.JSON_CONFIG_URL]));
      if (staleResponse) {
        console.warn('[Worker] 🔶 Fatal error, but serving STALE cached config as a fallback.');
        return staleResponse;
      }
      return new Response('Internal Server Error: Failed to fetch configuration', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  }
};

/**
 * =================================================================================
 * Helper Function: Handles User-Agent Validation Logic
 * @param {Request} request - The incoming request object.
 * @param {object} env - The environment variables.
 * @returns {Promise<{isValid: boolean, clientType: string, version: string}>}
 * =================================================================================
 */
async function handleUaValidation(request, env) {
  const userAgent = request.headers.get('User-Agent') || '';
  let uaPatterns = DEFAULTS.UA_PATTERNS;

  const uaPatternsConfig = env[ENV_VARS.UA_PATTERNS];
  if (uaPatternsConfig) {
    try {
      uaPatterns = JSON.parse(uaPatternsConfig);
      console.log('[Worker] Loaded UA patterns from environment JSON.');
    } catch (e) {
      uaPatterns = uaPatternsConfig.split(',').map(p => ({
        pattern: p.trim(),
        type: 'custom',
        description: `Custom pattern: ${p.trim()}`
      }));
      console.log('[Worker] Loaded UA patterns from comma-separated list.');
    }
  }

  for (const { pattern, type, description } of uaPatterns) {
    try {
      const regex = new RegExp(pattern, 'i');
      const match = userAgent.match(regex);

      if (match) {
        // Dynamic version extraction from the first capture group, if it exists.
        const version = match.length > 1 ? match[1] : 'N/A';
        return { isValid: true, clientType: type, version };
      }
    } catch (err) {
      console.error(`[Worker] Invalid regex pattern skipped: "${pattern}". Error: ${err.message}`);
    }
  }

  console.log(`[Worker] No UA pattern matched for: "${userAgent.substring(0, 100)}..."`);
  return { isValid: false, clientType: 'unknown', version: 'unknown' };
}

/**
 * =================================================================================
 * Helper Function: Fetches from Cache or Origin with SWR
 * @param {object} env - The environment variables.
 * @param {object} ctx - The execution context for waitUntil.
 * @returns {Promise<Response>}
 * =================================================================================
 */
async function fetchAndCacheConfig(env, ctx) {
  const realConfigUrl = env[ENV_VARS.JSON_CONFIG_URL];
  if (!realConfigUrl) {
    throw new Error('Missing JSON_CONFIG_URL environment variable');
  }

  const cache = caches.default;
  const cacheKey = new Request(realConfigUrl);

  let response = await cache.match(cacheKey);
  if (response) {
    console.log('[Worker] ✅ Cache HIT - Returning cached config.');
    return response;
  }
  console.log('[Worker] ❌ Cache MISS - Fetching from origin.');

  // Fetch from origin with retry logic
  const originResponse = await fetchWithRetry(realConfigUrl);
  
  // Process encoding and prepare for caching
  const processedResponse = await handleResponseEncoding(originResponse);

  const cacheMaxAge = parseInt(env[ENV_VARS.CACHE_MAX_AGE], 10) || DEFAULTS.CACHE_MAX_AGE;
  const swrMaxAge = parseInt(env[ENV_VARS.SWR_MAX_AGE], 10) || DEFAULTS.SWR_MAX_AGE;

  const cacheHeaders = new Headers(processedResponse.headers);
  cacheHeaders.set('Cache-Control', `public, max-age=${cacheMaxAge}, stale-while-revalidate=${swrMaxAge}`);
  cacheHeaders.set('CDN-Cache-Control', `public, max-age=${cacheMaxAge}, stale-while-revalidate=${swrMaxAge}`);
  
  const responseToCache = new Response(processedResponse.body, {
    status: processedResponse.status,
    headers: cacheHeaders
  });

  // Cache the response asynchronously
  ctx.waitUntil(cache.put(cacheKey, responseToCache.clone()));
  
  console.log(`[Worker] ✅ Config fetched from origin and cached.`);
  return responseToCache;
}

/**
 * =================================================================================
 * Helper Function: Fetch with Exponential Backoff Retry
 * @param {string} url - The URL to fetch.
 * @param {number} maxRetries - The maximum number of retries.
 * @returns {Promise<Response>}
 * =================================================================================
 */
async function fetchWithRetry(url, maxRetries = 2) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                const delay = 1000 * Math.pow(2, attempt - 1);
                console.log(`[Worker] Retrying fetch... attempt ${attempt}, waiting ${delay}ms`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            const response = await fetch(url);
            if (response.ok) {
                return response;
            }
            lastError = new Error(`Origin server returned status ${response.status}`);
        } catch (error) {
            lastError = error;
        }
    }
    console.error(`[Worker] Fetch failed after ${maxRetries} retries.`, lastError);
    throw lastError;
}

/**
 * =================================================================================
 * Helper Function: Intelligently Handles Response Encoding (BOM detection)
 * @param {Response} response - The original response from the origin.
 * @returns {Promise<Response>} A new response with corrected encoding.
 * =================================================================================
 */
async function handleResponseEncoding(response) {
  const headers = new Headers(response.headers);
  const contentType = headers.get('Content-Type') || '';

  // If charset is already specified, trust it and move on.
  if (contentType.toLowerCase().includes('charset=')) {
    return response;
  }
  
  const responseClone = response.clone();
  const arrayBuffer = await responseClone.arrayBuffer();
  let body = arrayBuffer;
  let charset = 'utf-8'; // Default to utf-8

  // BOM detection
  if (arrayBuffer.byteLength >= 3) {
    const view = new Uint8Array(arrayBuffer);
    if (view[0] === 0xEF && view[1] === 0xBB && view[2] === 0xBF) {
      charset = 'utf-8';
      body = arrayBuffer.slice(3); // Remove BOM
    } else if (view[0] === 0xFE && view[1] === 0xFF) {
      charset = 'utf-16be';
      body = arrayBuffer.slice(2);
    } else if (view[0] === 0xFF && view[1] === 0xFE) {
      charset = 'utf-16le';
      body = arrayBuffer.slice(2);
    }
  }

  // Set the correct Content-Type with the detected charset
  if (contentType.includes('application/json') || contentType.includes('text/')) {
    headers.set('Content-Type', `${contentType.split(';')[0]}; charset=${charset}`);
  } else if (!contentType) {
    headers.set('Content-Type', `application/json; charset=${charset}`);
  }
  
  return new Response(body, {
    status: response.status,
    headers: headers
  });
}
