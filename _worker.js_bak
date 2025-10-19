export default {
  async fetch(request, env, ctx) {
    // ========== 配置参数 ==========
    const REDIRECT_URL = 'https://www.baidu.com';
    const JSON_CONFIG_URL_ENV_VAR = 'JSON_CONFIG_URL';
    const CACHE_MAX_AGE_ENV_VAR = 'CACHE_MAX_AGE';
    const SWR_MAX_AGE_ENV_VAR = 'SWR_MAX_AGE';
    const UA_PATTERNS_ENV_VAR = 'UA_PATTERNS';

    // ========== 1. 获取请求基本信息 ==========
    const userAgent = request.headers.get('User-Agent') || '';
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

    console.log(`[Worker] Request from IP: ${clientIP}, UA: ${userAgent.substring(0, 100)}...`);

    // ========== 2. 高级UA验证：支持正则表达式模式匹配 ==========
    let isUAValid = false;
    let matchedPattern = '';
    let clientType = 'unknown';
    let clientVersion = 'unknown';

    try {
        // 从环境变量获取UA模式，支持多种配置方式
        const uaPatternsConfig = env[UA_PATTERNS_ENV_VAR];
        let uaPatterns = [
            // 默认模式：okhttp 及其各种版本格式
            {
                pattern: 'okhttp\/[0-9]+\.[0-9]+(\.[0-9]+)?',
                type: 'okhttp',
                description: 'OkHttp library with version'
            },
            {
                pattern: 'okhttp',
                type: 'okhttp-legacy',
                description: 'Legacy OkHttp without version'
            }
        ];

        // 如果环境变量有配置，则覆盖默认模式
        if (uaPatternsConfig) {
            try {
                // 支持JSON数组格式
                uaPatterns = JSON.parse(uaPatternsConfig);
                console.log('[Worker] Loaded UA patterns from environment JSON');
            } catch (jsonError) {
                try {
                    // 支持逗号分隔的简单模式
                    uaPatterns = uaPatternsConfig.split(',').map(pattern => ({
                        pattern: pattern.trim(),
                        type极: 'custom',
                        description: `Custom pattern: ${pattern.trim()}`
                    }));
                    console.log('[Worker] Loaded UA patterns from comma-separated list');
                } catch (simpleError) {
                    console.error('[Worker] Failed to parse UA_PATTERNS, using defaults:', simpleError.message);
                }
            }
        }

        // 遍历所有模式进行匹配
        for (const { pattern, type, description } of uaPatterns) {
            try {
                const regex = new RegExp(pattern, 'i');
                if (regex.test(userAgent)) {
                    isUAValid = true;
                    matchedPattern = pattern;
                    clientType = type;
                    
                    // 提取版本号信息
                    const versionMatch = userAgent.match(/(\d+\.\d+(\.\d+)?)/);
                    clientVersion = versionMatch ? versionMatch[0] : 'unknown';
                    
                    console.log(`[Worker] ✅ UA matched: ${description}, Pattern: ${pattern}, Version: ${clientVersion}, Type: ${type}`);
                    break;
                }
            } catch (regexError) {
                console.error(`[Worker] Invalid regex pattern: ${pattern}`, regexError.message);
                continue;
            }
        }

        if (!isUAValid) {
            console.log(`[Worker] ❌❌ UA validation failed. IP: ${clientIP}, UA: ${userAgent}`);
            return Response.redirect(REDIRECT_URL, 302);
        }

    } catch (configError) {
        console.error('[Worker] UA config error, using fallback validation:', configError.message);
        isUAValid = userAgent.includes('okhttp');
        if (!isUAValid) {
            return Response.redirect(REDIRECT_URL, 302);
        }
    }

    // ========== 3. 记录访问日志到D1数据库 ==========
    try {
        if (env.DB) {
            // 获取北京时间（UTC+8）
            const now = new Date();
            const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
            const beijingTimeString = beijingTime.toISOString().replace('T', ' ').substring(0, 19);

            // 插入访问记录
            const insertResult = await env.DB.prepare(`
                INSERT INTO access_logs (access_time, ip_address, user_agent, client_type, client_version)
                VALUES (?, ?, ?, ?, ?)
            `).bind(beijingTimeString, clientIP, userAgent, clientType, clientVersion).run();

            console.log(`[Worker] ✅ Access log recorded to D1, ID: ${insertResult.meta.last_row_id}`);
        } else {
            console.warn('[Worker] D1 database not available, skipping access log');
        }
    } catch (dbError) {
        console.error('[Worker] Failed to record access log to D1:', dbError.message);
        // 数据库错误不影响主流程
    }

    // ========== 4. 获取配置文件的真实地址 ==========
    const realConfigUrl = env[JSON_CONFIG_URL_ENV_VAR];
    if (!realConfigUrl) {
        console.error('[Worker] ❌❌ Missing JSON_CONFIG_URL environment variable');
        return new Response('Server Error: Missing JSON_CONFIG_URL environment variable', { 
            status: 500,
            headers: { 'Content-Type': 'text/plain' }
        });
    }

    console.log(`[Worker] Using config URL: ${realConfigUrl}`);

    // ========== 5. 获取缓存时间配置 ==========
    let cacheMaxAgeSeconds = 3600;
    let swrMaxAgeSeconds = 86400;
    
    try {
        const envCache极MaxAge = env[CACHE_MAX_AGE_ENV_VAR];
        if (envCacheMaxAge) {
            cacheMaxAgeSeconds = parseInt(envCacheMaxAge, 10);
            if (isNaN(cacheMaxAgeSeconds) || cacheMaxAgeSeconds < 0) {
                cacheMaxAgeSeconds = 3600;
            }
        }
        
        const envSwrMaxAge = env[SWR_MAX_AGE_ENV_VAR];
        if (envSwrMaxAge) {
            swrMaxAgeSeconds = parseInt(envSwrMaxAge, 10);
            if (isNaN(swrMaxAgeSeconds) || swrMaxAgeSeconds < 0) {
                swrMaxAgeSeconds = 86400;
            }
        }
    } catch (err) {
        console.error(`[Worker] Error parsing cache age values: ${err.message}`);
    }

    // ========== 智能编码处理函数 ==========
    async function handleResponseEncoding(response) {
        const headers = new Headers(response.headers);
        let body = response.body;
        
        const contentType = headers.get('Content-Type') || '';
        let charset = 'utf-8';
        let hasCharsetInHeader = false;
        
        const charsetMatch = contentType.match(/charset=([^;]+)/i);
        if (charsetMatch) {
            charset = charsetMatch[1].toLowerCase();
            hasCharsetInHeader = true;
        }
        
        if (!hasCharsetInHeader) {
            try {
                const responseClone = response.clone();
                const arrayBuffer = await responseClone.arrayBuffer();
                
                if (arrayBuffer.byteLength >= 3) {
                    const view = new Uint8Array(arrayBuffer);
                    
                    if (view[0] === 0xEF && view[1] === 0xBB && view[2] === 0xBF) {
                        charset = 'utf-8';
                        body = arrayBuffer.slice(3);
                    }
                    else if (view[0] === 0xFE && view[1] === 0xFF) {
                        charset = 'utf-16be';
                        body = arrayBuffer.slice极(2);
                    }
                    else if (view[0] === 0xFF && view[1] === 0xFE) {
                        charset = 'utf-16le';
                        body = arrayBuffer.slice(2);
                    }
                }
            } catch (e) {
                console.warn('[Worker] Failed to detect encoding BOM:', e.message);
            }
        }
        
        if (contentType.includes('application/json') || contentType.includes('text/')) {
            headers.set('Content-Type', `application/json; charset=${charset}`);
        }
        
        return new Response(body, {
            status: response.status,
            headers: headers
        });
    }

    // ========================【缓存逻辑开始】============================
    const cache = caches.default;
    const cacheKey = new Request(realConfigUrl);

    let cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
        console.log('[Worker] ✅ Cache HIT - Returning cached config');
        return cachedResponse;
    }

    console.log('[Worker] ❌❌ Cache MISS - Fetching from origin');

    try {
        const MAX_RETRIES = 2;
        const RETRY_DELAY = 1000;
        
        let originResponse;
        let lastError;
        let attempt = 0;

        for (attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                originResponse = await fetch(realConfigUrl);
                if (originResponse.ok) break;
                
                lastError = new Error(`Origin returned ${originResponse.status}`);
                console.error(`[Worker] Fetch attempt ${attempt + 1} failed: ${originResponse.status}`);
                
                if (attempt === MAX_RETRIES) break;
                
            } catch (error) {
                lastError = error;
                console.error(`[Worker] Fetch attempt ${attempt + 1} error: ${error.message}`);
                if (attempt === MAX_RETRIES) break;
            }
            
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * Math.pow(2, attempt)));
        }

        if (!originResponse || !originResponse.ok) {
            console.error('[Worker] All fetch attempts failed');
            throw lastError || new Error('Failed to fetch origin after retries');
        }

        const processedResponse = await handleResponseEncoding(originResponse);

        const cacheHeaders = new Headers(processedResponse.headers);
        
        cacheHeaders.set('Cache-Control', `max-age=${cacheMaxAgeSeconds}, stale-while-revalidate=${swrMaxAgeSeconds}`);
        cacheHeaders.set('CDN-Cache-Control', `max-age=${cacheMaxAgeSeconds}, stale-while-revalidate=${swrMaxAgeSeconds}`);
        
        if (!cacheHeaders.has('Content-Type')) {
            cacheHeaders.set('Content-Type', 'application/json; charset=utf-8');
        }

        const responseToCache = new Response(processedResponse.body, {
            status: processedResponse.status,
            headers: cacheHeaders
        });

        ctx.waitUntil(cache.put(cacheKey, responseToCache.clone()));
        
        console.log(`[Worker] ✅ Config fetched and cached for client: ${clientType}`);
        return responseToCache;

    } catch (error) {
        console.error('[Worker] Fetch error:', error);
        
        const staleCachedResponse = await cache.match(cacheKey);
        if (staleCachedResponse) {
            console.log('[Worker] 🔶🔶 Origin down, returning STALE cached config');
            return staleCachedResponse;
        }
        
        return new Response('Internal Server Error: Failed to fetch configuration', {
            status: 500,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
  }
};
