// _worker.js - 双重验证保护 (User-Agent + 软件Token)
export default {
  async fetch(request, env, ctx) {
    try {
      // 从环境变量读取配置（带错误处理和默认值）
      const CONFIG = {
        // 第一重：允许访问的User-Agent特征
        ALLOWED_USER_AGENTS: tryParseJSON(env.ALLOWED_USER_AGENTS, ['okhttp', 'tvbox', '影视仓']),
        
        // 第二重：有效的软件Token列表
        VALID_APP_TOKENS: new Set(tryParseJSON(env.SECRET_APP_TOKENS, ['default_token_please_change'])),
        
        // 配置文件地址
        JSON_CONFIG_URL: env.JSON_CONFIG_URL || 'https://devilardis.github.io/TV-TEST-BOX/TEST.json',
        
        // 重定向地址
        REDIRECT_URL: env.REDIRECT_URL || 'https://www.baidu.com',
        
        // 调试模式
        DEBUG_MODE: (env.DEBUG_MODE || 'true') === 'true'
      };

      // 获取请求信息
      const url = new URL(request.url);
      const userAgent = request.headers.get('user-agent') || '';
      const path = url.pathname;
      const clientIP = request.headers.get('cf-connecting-ip') || 'unknown';

      // 调试信息
      if (CONFIG.DEBUG_MODE) {
        console.log(`[DEBUG] 请求路径: ${path}, IP: ${clientIP}, UA: ${userAgent.substring(0, 50)}...`);
      }

      // 1. 第一重验证：User-Agent检测
      const isUserAgentValid = CONFIG.ALLOWED_USER_AGENTS.some(ua => 
        userAgent.toLowerCase().includes(ua.toLowerCase())
      );

      // 2. 第二重验证：软件Token检测
      let isAppTokenValid = false;
      let providedAppToken = null;

      // 从URL参数获取
      const urlToken = url.searchParams.get('token');
      if (urlToken && CONFIG.VALID_APP_TOKENS.has(urlToken)) {
        isAppTokenValid = true;
        providedAppToken = urlToken;
      }

      // 从Authorization头获取
      const authHeader = request.headers.get('Authorization');
      if (!isAppTokenValid && authHeader && authHeader.startsWith('Bearer ')) {
        const bearerToken = authHeader.substring(7);
        if (CONFIG.VALID_APP_TOKENS.has(bearerToken)) {
          isAppTokenValid = true;
          providedAppToken = bearerToken;
        }
      }

      // 验证结果汇总
      const validationResults = {
        userAgent: isUserAgentValid,
        appToken: isAppTokenValid,
        clientIP: clientIP,
        timestamp: new Date().toISOString()
      };

      if (CONFIG.DEBUG_MODE) {
        console.log(`[DEBUG] 验证结果: UA:${isUserAgentValid}, AppToken:${isAppTokenValid}`);
      }

      // 处理配置请求
      if (path === '/' || path === '/api/config') {
        // 双重验证模式：必须同时通过两重验证
        if (isUserAgentValid && isAppTokenValid) {
          // 验证通过，返回配置文件
          try {
            if (CONFIG.DEBUG_MODE) {
              console.log(`[DEBUG] 正在获取配置文件: ${CONFIG.JSON_CONFIG_URL}`);
            }
            
            const configResponse = await fetch(CONFIG.JSON_CONFIG_URL);
            
            if (configResponse.ok) {
              const configData = await configResponse.text();
              
              if (CONFIG.DEBUG_MODE) {
                console.log('[DEBUG] 配置文件获取成功，返回给客户端');
              }
              
              return new Response(configData, {
                status: 200,
                headers: {
                  'Content-Type': 'application/json; charset=utf-8',
                  'Cache-Control': 'public, max-age=3600',
                  'Access-Control-Allow-Origin': '*',
                  'X-Validation-Result': 'PASSED'
                }
              });
            } else {
              console.error(`[ERROR] 配置文件获取失败: ${configResponse.status}`);
              return new Response(JSON.stringify({ 
                error: '无法获取配置文件',
                status: configResponse.status
              }), { 
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          } catch (error) {
            console.error('[ERROR] 获取配置文件时出错:', error.message);
            return new Response(JSON.stringify({ 
              error: '服务器内部错误',
              details: error.message
            }), { 
              status: 500,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        } else {
          // 验证失败
          if (CONFIG.DEBUG_MODE) {
            console.log('[DEBUG] 验证失败，重定向到:', CONFIG.REDIRECT_URL);
          }
          
          // 返回详细的错误信息或重定向
          if (path === '/api/config') {
            return new Response(JSON.stringify({
              error: 'Access Denied',
              validation: validationResults,
              required: '必须同时通过User-Agent和Token验证',
              help: '请确保请求包含正确的User-Agent和Token参数'
            }), {
              status: 403,
              headers: { 'Content-Type': 'application/json' }
            });
          } else {
            return Response.redirect(CONFIG.REDIRECT_URL, 302);
          }
        }
      }

      // 健康检查端点（无需验证）
      if (path === '/health') {
        return new Response(JSON.stringify({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          worker: 'tvbox-config-router',
          config: {
            hasUserAgents: CONFIG.ALLOWED_USER_AGENTS.length > 0,
            hasAppTokens: CONFIG.VALID_APP_TOKENS.size > 0,
            configUrl: CONFIG.JSON_CONFIG_URL
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 调试信息端点（无需验证）
      if (path === '/debug') {
        return new Response(JSON.stringify({
          request: {
            path: path,
            userAgent: userAgent,
            clientIP: clientIP,
            url: request.url
          },
          config: {
            allowedUserAgents: CONFIG.ALLOWED_USER_AGENTS,
            hasAppTokens: CONFIG.VALID_APP_TOKENS.size > 0,
            configUrl: CONFIG.JSON_CONFIG_URL,
            redirectUrl: CONFIG.REDIRECT_URL
          }
        }, null, 2), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 其他路径返回404
      return new Response(JSON.stringify({
        error: 'Not Found',
        path: path,
        availableEndpoints: ['/', '/api/config', '/health', '/debug']
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      // 全局错误处理
      console.error('[FATAL ERROR]', error.message, error.stack);
      return new Response(JSON.stringify({
        error: 'Internal Server Error',
        message: error.message,
        timestamp: new Date().toISOString()
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

// JSON解析辅助函数（带错误处理）
function tryParseJSON(str, defaultValue) {
  try {
    return JSON.parse(str || '[]');
  } catch (error) {
    console.warn('[WARN] JSON解析失败，使用默认值:', error.message);
    return defaultValue;
  }
}
