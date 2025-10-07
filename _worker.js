export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    // 处理管理页面请求
    if (pathname === '/admin' || pathname === '/admin/') {
      return this.handleAdminPage(request, env);
    }
    
    // 处理管理API请求
    if (pathname.startsWith('/admin/api/')) {
      return this.handleAdminApi(request, env, pathname);
    }
    
    // 原有UA检测逻辑
    return this.handleUAValidation(request, env, ctx);
  },

  // 处理管理页面
  async handleAdminPage(request, env) {
    const html = `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>UA设备管理面板</title>
        <style>
            /* CSS样式保持不变 */
        </style>
    </head>
    <body>
        <div class="container">
            <!-- HTML内容保持不变 -->
        </div>

        <script>
            // JavaScript代码保持不变
        </script>
    </body>
    </html>
    `;
    
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  },

  // 确保表存在的函数
  async ensureTablesExist(db) {
    try {
      // 检查ua_rules表是否存在
      const { results } = await db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='ua_rules'"
      ).all();
      
      // 如果表不存在，则创建它们
      if (results.length === 0) {
        console.log('Creating missing database tables...');
        
        // 创建ua_rules表
        await db.prepare(`
          CREATE TABLE ua_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pattern TEXT NOT NULL,
            type TEXT NOT NULL,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `).run();
        
        // 创建access_log表
        await db.prepare(`
          CREATE TABLE access_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            ip TEXT NOT NULL,
            ua TEXT NOT NULL,
            matched BOOLEAN NOT NULL,
            pattern TEXT
          )
        `).run();
        
        // 插入默认数据 - 使用参数化查询避免SQL注入和语法错误
        const defaultRules = [
          {pattern: 'okhttp\\/[0-9]+\\.[0-9]+(\\.[0-9]+)?', type: 'okhttp', description: 'OkHttp library with version'},
          {pattern: 'okhttp', type: 'okhttp-legacy', description: 'Legacy OkHttp without version'},
          {pattern: 'Dalvik\\/.*', type: 'android', description: 'Android applications'},
          {pattern: 'CFNetwork\\/.*', type: 'ios', description: 'iOS applications'}
        ];
        
        for (const rule of defaultRules) {
          await db.prepare(
            "INSERT INTO ua_rules (pattern, type, description) VALUES (?, ?, ?)"
          ).bind(rule.pattern, rule.type, rule.description).run();
        }
        
        console.log('Database tables created successfully');
      }
    } catch (error) {
      console.error('Error ensuring tables exist:', error);
    }
  },

  // 处理管理API
  async handleAdminApi(request, env, pathname) {
    try {
      // 确保表存在
      await this.ensureTablesExist(env.DB);
      
      // 获取UA规则列表
      if (pathname === '/admin/api/rules' && request.method === 'GET') {
        const { results } = await env.DB.prepare(
          "SELECT id, pattern, type, description, created_at FROM ua_rules ORDER BY created_at DESC"
        ).all();
        
        return Response.json({ success: true, data: results });
      }
      
      // 添加UA规则
      if (pathname === '/admin/api/rules' && request.method === 'POST') {
        const { pattern, type, description } = await request.json();
        
        const { success } = await env.DB.prepare(
          "INSERT INTO ua_rules (pattern, type, description) VALUES (?, ?, ?)"
        ).bind(pattern, type, description).run();
        
        return Response.json({ success });
      }
      
      // 删除UA规则
      if (pathname.startsWith('/admin/api/rules/') && request.method === 'DELETE') {
        const id = pathname.split('/').pop();
        
        const { success } = await env.DB.prepare(
          "DELETE FROM ua_rules WHERE id = ?"
        ).bind(id).run();
        
        return Response.json({ success });
      }
      
      // 获取访问日志
      if (pathname === '/admin/api/logs' && request.method === 'GET') {
        const { results } = await env.DB.prepare(
          "SELECT id, timestamp, ip, ua, matched, pattern FROM access_log ORDER BY timestamp DESC LIMIT 100"
        ).all();
        
        return Response.json({ success: true, data: results });
      }
      
      // 获取统计数据
      if (pathname === '/admin/api/stats' && request.method === 'GET') {
        const totalRules = await env.DB.prepare(
          "SELECT COUNT(*) as count FROM ua_rules"
        ).first();
        
        const todayMatches = await env.DB.prepare(
          "SELECT COUNT(*) as count FROM access_log WHERE matched = 1 AND date(timestamp) = date('now')"
        ).first();
        
        const todayBlocks = await env.DB.prepare(
          "SELECT COUNT(*) as count FROM access_log WHERE matched = 0 AND date(timestamp) = date('now')"
        ).first();
        
        const totalRequests = await env.DB.prepare(
          "SELECT COUNT(*) as count FROM access_log"
        ).first();
        
        return Response.json({
          success: true,
          data: {
            totalRules: totalRules.count,
            todayMatches: todayMatches.count,
            todayBlocks: todayBlocks.count,
            totalRequests: totalRequests.count
          }
        });
      }
      
      return new Response('Not found', { status: 404 });
    } catch (error) {
      return Response.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }
  },

  // 原有UA验证逻辑
  async handleUAValidation(request, env, ctx) {
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

    try {
        // 确保表存在
        await this.ensureTablesExist(env.DB);
        
        // 从数据库获取UA模式
        const { results: uaPatterns } = await env.DB.prepare(
            "SELECT pattern, type, description FROM ua_rules"
        ).all();

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
                    const version = versionMatch ? versionMatch[0] : 'unknown';
                    
                    console.log(`[Worker] ✅ UA matched: ${description}, Pattern: ${pattern}, Version: ${version}, Type: ${type}`);
                    break;
                }
            } catch (regexError) {
                console.error(`[Worker] Invalid regex pattern: ${pattern}`, regexError.message);
                continue;
            }
        }

        // 记录访问日志到D1数据库
        ctx.waitUntil(env.DB.prepare(
            "INSERT INTO access_log (ip, ua, matched, pattern) VALUES (?, ?, ?, ?)"
        ).bind(clientIP, userAgent, isUAValid ? 1 : 0, matchedPattern).run());

        if (!isUAValid) {
            console.log(`[Worker] ❌❌ UA validation failed. IP: ${clientIP}, UA: ${userAgent}`);
            return Response.redirect(REDIRECT_URL, 302);
        }

    } catch (configError) {
        console.error('[Worker] UA config error, using fallback validation:', configError.message);
        // 降级方案
        isUAValid = userAgent.includes('okhttp');
        
        // 记录访问日志
        ctx.waitUntil(env.DB.prepare(
            "INSERT INTO access_log (ip, ua, matched, pattern) VALUES (?, ?, ?, ?)"
        ).bind(clientIP, userAgent, isUAValid ? 1 : 0, '').run());
        
        if (!isUAValid) {
            return Response.redirect(REDIRECT_URL, 302);
        }
    }

    // 其余原有逻辑保持不变...
    // ========== 3. 获取配置文件的真实地址 ==========
    const realConfigUrl = env[JSON_CONFIG_URL_ENV_VAR];
    if (!realConfigUrl) {
        return new Response('Server Error: Missing JSON_CONFIG_URL environment variable', { 
            status: 500,
            headers: { 'Content-Type': 'text/plain' }
        });
    }

    // ========== 4. 获取缓存时间配置 ==========
    let cacheMaxAgeSeconds = 3600;
    let swrMaxAgeSeconds = 86400;
    
    try {
        const envCacheMaxAge = env[CACHE_MAX_AGE_ENV_VAR];
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
                        body = arrayBuffer.slice(2);
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
                if (attempt === MAX_RETRIES) break;
                
            } catch (error) {
                lastError = error;
                if (attempt === MAX_RETRIES) break;
            }
            
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * Math.pow(2, attempt)));
        }

        if (!originResponse || !originResponse.ok) {
            throw lastError || new Error('Failed to fetch origin after retries');
        }

        const processedResponse = await handleResponseEncoding(originResponse);

        const cacheHeaders = new Headers(processedResponse.headers);
        
        cacheHeaders.set('Cache-Control', `max-age=${cacheMaxAgeSeconds}, stale-while-revalidate=${swrMaxAgeSeconds}`);
        cacheHeaders.set('CDN-Cache-Control', `max-age=${cache极AgeSeconds}, stale-while-revalidate=${swrMaxAgeSeconds}`);
        
        if (!cacheHeaders.has('Content-Type')) {
            cacheHeaders.set('Content-Type', 'application/json; charset=utf-8');
        }

        const responseToCache = new Response(processedResponse.body, {
            status: processedResponse.status,
            headers: cacheHeaders
        });

        ctx.waitUntil(cache极(cacheKey, responseToCache.clone()));
        
        console.log(`[Worker] ✅ Config fetched and cached for client: ${clientType}`);
        return responseToCache;

    } catch (error) {
        console.error('[Worker] Fetch error:', error);
        
        const staleCachedResponse = await cache.match(cacheKey);
        if (stale极Response) {
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
