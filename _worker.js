export default {
  async fetch(request, env, ctx) {
    // ========== 配置参数 ==========
    const REDIRECT_URL = 'https://www.baidu.com';
    const JSON_CONFIG_URL_ENV_VAR = 'JSON_CONFIG_URL';
    const CACHE_MAX_AGE_ENV_VAR = 'CACHE_MAX_AGE';
    const SWR_MAX_AGE_ENV_VAR = 'SWR_MAX_AGE';
    const UA_PATTERNS_ENV_VAR = 'UA_PATTERNS';
    const ADMIN_USERNAME = env.ADMIN_USERNAME || 'admin';
    const ADMIN_PASSWORD = env.ADMIN_PASSWORD || 'password';
    const BYPASS_TOKEN = env.BYPASS_TOKEN || ''; // 新增：绕过UA检查的token

    // ========== 1. 获取请求基本信息 ==========
    const url = new URL(request.url);
    const userAgent = request.headers.get('User-Agent') || '';
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const pathname = url.pathname;
    const token = url.searchParams.get('token'); // 获取URL中的token参数

    console.log(`[Worker] Request from IP: ${clientIP}, Path: ${pathname}, Token: ${token ? 'provided' : 'not provided'}`);

    // ========== Token验证：如果提供了有效token，则跳过UA检查 ==========
    let isBypassUA = false;
    if (token && BYPASS_TOKEN && token === BYPASS_TOKEN) {
        isBypassUA = true;
        console.log(`[Worker] ✅ Token validation passed, skipping UA check for IP: ${clientIP}`);
    }

    // ========== 管理页面路由 ==========
    if (pathname.startsWith('/admin')) {
      return handleAdminRoutes(request, env, ctx, clientIP, userAgent);
    }

    // ========== 2. 高级UA验证（如果未使用token绕过） ==========
    if (!isBypassUA) {
        let isUAValid = false;
        let matchedPattern = '';
        let clientType = 'unknown';
        let softwareVersion = 'unknown';

        try {
            const uaPatternsConfig = env[UA_PATTERNS_ENV_VAR];
            let uaPatterns = [
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

            if (uaPatternsConfig) {
                try {
                    uaPatterns = JSON.parse(uaPatternsConfig);
                    console.log('[Worker] Loaded UA patterns from environment JSON');
                } catch (jsonError) {
                    try {
                        uaPatterns = uaPatternsConfig.split(',').map(pattern => ({
                            pattern: pattern.trim(),
                            type: 'custom',
                            description: `Custom pattern: ${pattern.trim()}`
                        }));
                        console.log('[Worker] Loaded UA patterns from comma-separated list');
                    } catch (simpleError) {
                        console.error('[Worker] Failed to parse UA_PATTERNS, using defaults:', simpleError.message);
                    }
                }
            }

            for (const { pattern, type, description } of uaPatterns) {
                try {
                    const regex = new RegExp(pattern, 'i');
                    if (regex.test(userAgent)) {
                        isUAValid = true;
                        matchedPattern = pattern;
                        clientType = type;
                        
                        const versionMatch = userAgent.match(/(\d+\.\d+(\.\d+)?)/);
                        softwareVersion = versionMatch ? versionMatch[0] : 'unknown';
                        
                        console.log(`[Worker] ✅ UA matched: ${description}, Pattern: ${pattern}, Version: ${softwareVersion}, Type: ${type}`);
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
    }

    // ========== 记录访问日志到D1数据库 ==========
    try {
        if (env.DB) {
            const clientType = isBypassUA ? 'token_bypass' : 'ua_verified';
            const softwareVersion = isBypassUA ? 'bypass' : (() => {
                const versionMatch = userAgent.match(/(\d+\.\d+(\.\d+)?)/);
                return versionMatch ? versionMatch[0] : 'unknown';
            })();
            
            ctx.waitUntil(logAccessToDatabase(env.DB, clientIP, userAgent, softwareVersion, clientType));
        }
    } catch (dbError) {
        console.error('[Worker] Failed to log access to database:', dbError.message);
    }

    // ========== 原有的配置获取逻辑 ==========
    const realConfigUrl = env[JSON_CONFIG_URL_ENV_VAR];
    if (!realConfigUrl) {
        return new Response('Server Error: Missing JSON_CONFIG_URL environment variable', { 
            status: 500,
            headers: { 'Content-Type': 'text/plain' }
        });
    }

    // ========== 缓存时间配置 ==========
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

    // ========== 缓存逻辑 ==========
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
        cacheHeaders.set('CDN-Cache-Control', `max-age=${cacheMaxAgeSeconds}, stale-while-revalidate=${swrMaxAgeSeconds}`);
        
        if (!cacheHeaders.has('Content-Type')) {
            cacheHeaders.set('Content-Type', 'application/json; charset=utf-8');
        }

        const responseToCache = new Response(processedResponse.body, {
            status: processedResponse.status,
            headers: cacheHeaders
        });

        ctx.waitUntil(cache.put(cacheKey, responseToCache.clone()));
        
        console.log(`[Worker] ✅ Config fetched and cached (access type: ${isBypassUA ? 'token bypass' : 'UA verified'})`);
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

// ========== 数据库记录函数 ==========
async function logAccessToDatabase(db, ip, userAgent, softwareVersion, clientType) {
    try {
        const result = await db.prepare(`
        INSERT INTO access_logs (ip_address, user_agent, software_version, client_type, access_time)
        VALUES (?, ?, ?, ?, datetime('now'))
        `).bind(ip, userAgent.substring(0, 500), softwareVersion, clientType).run();
        
        console.log(`[DB] Access logged successfully for IP: ${ip}, Type: ${clientType}`);
        return result;
    } catch (error) {
        console.error('[DB] Error logging access:', error.message);
        throw error;
    }
}

// ========== 管理页面路由处理 ==========
async function handleAdminRoutes(request, env, ctx, clientIP, userAgent) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    // 检查管理员认证
    const isAuthenticated = await checkAdminAuth(request, env);
    
    if (pathname === '/admin/login') {
        if (request.method === 'POST') {
            return handleAdminLogin(request, env);
        }
        return serveLoginPage();
    }
    
    if (!isAuthenticated) {
        return Response.redirect('/admin/login', 302);
    }
    
    if (pathname === '/admin' || pathname === '/admin/') {
        return serveAdminDashboard(env);
    }
    
    if (pathname === '/admin/logs') {
        const page = parseInt(url.searchParams.get('page') || '1');
        const limit = parseInt(url.searchParams.get('limit') || '50');
        return serveAccessLogs(env, page, limit);
    }
    
    if (pathname === '/admin/api/logs') {
        const page = parseInt(url.searchParams.get('page') || '1');
        const limit = parseInt(url.searchParams.get('limit') || '50');
        return getAccessLogsAPI(env, page, limit);
    }
    
    if (pathname === '/admin/logout') {
        return handleAdminLogout();
    }
    
    return new Response('Admin Page Not Found', { status: 404 });
}

// ========== 管理员认证检查 ==========
async function checkAdminAuth(request, env) {
    const cookieHeader = request.headers.get('Cookie');
    if (!cookieHeader) return false;
    
    const cookies = Object.fromEntries(cookieHeader.split(';').map(c => c.trim().split('=')));
    const sessionToken = cookies.admin_session;
    
    if (!sessionToken) return false;
    
    // 简单的会话验证
    const expectedToken = await generateSessionToken(env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
    return sessionToken === expectedToken;
}

// ========== 生成会话令牌 ==========
async function generateSessionToken(username, password) {
    const text = `${username}:${password}:${Math.floor(Date.now() / (24 * 60 * 60 * 1000))}`; // 按天过期
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ========== 管理员登录处理 ==========
async function handleAdminLogin(request, env) {
    try {
        const formData = await request.formData();
        const username = formData.get('username');
        const password = formData.get('password');
        
        if (username === env.ADMIN_USERNAME && password === env.ADMIN_PASSWORD) {
            const sessionToken = await generateSessionToken(username, password);
            
            const response = Response.redirect('/admin', 302);
            response.headers.set('Set-Cookie', `admin_session=${sessionToken}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`);
            
            return response;
        } else {
            return serveLoginPage('Invalid username or password');
        }
    } catch (error) {
        return serveLoginPage('Login error');
    }
}

// ========== 管理员退出 ==========
function handleAdminLogout() {
    const response = Response.redirect('/admin/login', 302);
    response.headers.set('Set-Cookie', 'admin_session=; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
    return response;
}

// ========== 登录页面 ==========
function serveLoginPage(errorMessage = '') {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Admin Login</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: Arial, sans-serif; max-width: 400px; margin: 100px auto; padding: 20px; }
        .login-form { background: #f5f5f5; padding: 30px; border-radius: 8px; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input[type="text"], input[type="password"] { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
        button { width: 100%; padding: 10px; background: #007cba; color: white; border: none; border-radius: 4px; cursor: pointer; }
        .error { color: red; margin-bottom: 15px; }
    </style>
</head>
<body>
    <div class="login-form">
        <h2>Admin Login</h2>
        ${errorMessage ? `<div class="error">${errorMessage}</div>` : ''}
        <form method="POST">
            <div class="form-group">
                <label for="username">Username:</label>
                <input type="text" id="username" name="username" required>
            </div>
            <div class="form-group">
                <label for="password">Password:</label>
                <input type="password" id="password" name="password" required>
            </div>
            <button type="submit">Login</button>
        </form>
    </div>
</body>
</html>
    `;
    
    return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
}

// ========== 管理仪表板 ==========
async function serveAdminDashboard(env) {
    try {
        // 获取统计信息
        const totalVisits = await env.DB.prepare('SELECT COUNT(*) as count FROM access_logs').first();
        const todayVisits = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM access_logs 
        WHERE date(access_time) = date('now')
        `).first();
        
        const clientTypes = await env.DB.prepare(`
        SELECT client_type, COUNT(*) as count 
        FROM access_logs 
        GROUP BY client_type 
        ORDER BY count DESC
        `).all();
        
        const tokenAccessCount = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM access_logs 
        WHERE client_type = 'token_bypass'
        `).first();
        
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Access Logs Dashboard</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .stat-card { background: white; padding: 20px; border-radius: 8px; text-align: center; }
        .stat-number { font-size: 2em; font-weight: bold; color: #007cba; }
        .nav { margin-bottom: 20px; }
        .nav a { margin-right: 15px; text-decoration: none; color: #007cba; }
        table { width: 100%; background: white; border-collapse: collapse; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f9f9f9; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Access Logs Dashboard</h1>
        <div class="nav">
            <a href="/admin">Dashboard</a>
            <a href="/admin/logs">View Logs</a>
            <a href="/admin/logout">Logout</a>
        </div>
    </div>
    
    <div class="stats">
        <div class="stat-card">
            <div class="stat-number">${totalVisits?.count || 0}</div>
            <div>Total Visits</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${todayVisits?.count || 0}</div>
            <div>Today's Visits</div>
        </div>
    </div>
    
    <h2>Client Type Distribution</h2>
    <table>
        <tr><th>Client Type</th><th>Count</th></tr>
        ${clientTypes.results.map(row => `
            <tr>
                <td>${row.client_type || 'Unknown'}</td>
                <td>${row.count}</td>
            </tr>
        `).join('')}
    </table>
    
    <p><a href="/admin/logs">View detailed access logs →</a></p>
</body>
</html>
    `;
    
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  } catch (error) {
    return new Response('Error loading dashboard: ' + error.message, { status: 500 });
  }
}

// ========== 访问日志页面 ==========
async function serveAccessLogs(env, page = 1, limit = 50) {
  try {
    const offset = (page - 1) * limit;
    const logs = await env.DB.prepare(`
      SELECT * FROM access_logs 
      ORDER BY access_time DESC 
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();
    
    const totalCount = await env.DB.prepare('SELECT COUNT(*) as count FROM access_logs').first();
    const totalPages = Math.ceil(totalCount.count / limit);
    
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Access Logs</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .nav { margin-bottom: 20px; }
        .nav a { margin-right: 15px; text-decoration: none; color: #007cba; }
        table { width: 100%; background: white; border-collapse: collapse; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f9f9f9; }
        .pagination { margin-top: 20px; text-align: center; }
        .pagination a { margin: 0 5px; padding: 5px 10px; border: 1px solid #ddd; text-decoration: none; }
        .pagination a.active { background: #007cba; color: white; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Access Logs</h1>
        <div class="nav">
            <a href="/admin">Dashboard</a>
            <a href="/admin/logs">View Logs</a>
            <a href="/admin/logout">Logout</a>
        </div>
    </div>
    
    <table>
        <tr>
            <th>Time</th>
            <th>IP Address</th>
            <th>Client Type</th>
            <th>Software Version</th>
            <th>User Agent</th>
        </tr>
        ${logs.results.map(log => `
            <tr>
                <td>${new Date(log.access_time).toLocaleString()}</td>
                <td>${log.ip_address}</td>
                <td>${log.client_type || 'Unknown'}</td>
                <td>${log.software_version || 'Unknown'}</td>
                <td title="${log.user_agent}">${log.user_agent?.substring(0, 50)}...</td>
            </tr>
        `).join('')}
    </table>
    
    <div class="pagination">
        ${page > 1 ? `<a href="/admin/logs?page=${page - 1}&limit=${limit}">Previous</a>` : ''}
        ${Array.from({length: totalPages}, (_, i) => i + 1).map(p => 
          `<a href="/admin/logs?page=${p}&limit=${limit}" ${p === page ? 'class="active"' : ''}>${p}</a>`
        ).join('')}
        ${page < totalPages ? `<a href="/admin/logs?page=${page + 1}&limit=${limit}">Next</a>` : ''}
    </div>
</body>
</html>
    `;
    
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  } catch (error) {
    return new Response('Error loading logs: ' + error.message, { status: 500 });
  }
}

// ========== API接口（可选，用于前端AJAX） ==========
async function getAccessLogsAPI(env, page = 1, limit = 50) {
  try {
    const offset = (page - 1) * limit;
    const logs = await env.DB.prepare(`
      SELECT * FROM access_logs 
      ORDER BY access_time DESC 
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();
    
    const totalCount = await env.DB.prepare('SELECT COUNT(*) as count FROM access_logs').first();
    
    return new Response(JSON.stringify({
      success: true,
      data: logs.results,
      pagination: {
        page,
        limit,
        total: totalCount.count,
        totalPages: Math.ceil(totalCount.count / limit)
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
