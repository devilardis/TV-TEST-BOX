// _worker.js - 三重验证保护 (User-Agent + 软件Token + Cloudflare Token)
export default {
  async fetch(request, env, ctx) {
    // 从环境变量读取配置（安全敏感信息）
    const CONFIG = {
      // 第一重：允许访问的User-Agent特征
      ALLOWED_USER_AGENTS: JSON.parse(env.ALLOWED_USER_AGENTS || '["okhttp","tvbox","影视仓"]'),
      
      // 第二重：有效的软件Token列表
      VALID_APP_TOKENS: new Set(JSON.parse(env.SECRET_APP_TOKENS || '[]')),
      
      // 第三重：Cloudflare API Token验证
      CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN || '',
      //CLOUDFLARE_ZONE_ID: env.CLOUDFLARE_ZONE_ID || '',
      
      // 配置文件地址
      JSON_CONFIG_URL: env.JSON_CONFIG_URL || 'https://devilardis.github.io/TV-TEST-BOX/TEST.json',
      
      // 重定向地址
      REDIRECT_URL: env.REDIRECT_URL || 'https://www.baidu.com',
      
      // 调试模式
      DEBUG_MODE: env.DEBUG_MODE === 'true'
    };

    // 获取请求信息
    const url = new URL(request.url);
    const userAgent = request.headers.get('user-agent') || '';
    const path = url.pathname;
    const clientIP = request.headers.get('cf-connecting-ip') || 'unknown';

    // 调试信息
    if (CONFIG.DEBUG_MODE) {
      console.log(`[${new Date().toISOString()}] 请求来自: ${clientIP}, 路径: ${path}, UA: ${userAgent}`);
    }

    // 1. 第一重验证：User-Agent检测
    const isUserAgentValid = CONFIG.ALLOWED_USER_AGENTS.some(ua => 
      userAgent.toLowerCase().includes(ua.toLowerCase())
    );

    // 2. 第二重验证：软件Token检测（支持URL参数和Authorization头）
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

    // 3. 第三重验证：Cloudflare Token验证（特殊头验证）
    let isCloudflareTokenValid = false;
    const cfTokenHeader = request.headers.get('X-CF-Token');
    if (cfTokenHeader && cfTokenHeader === CONFIG.CLOUDFLARE_API_TOKEN) {
      isCloudflareTokenValid = true;
    }

    // 验证结果汇总
    const validationResults = {
      userAgent: isUserAgentValid,
      appToken: isAppTokenValid,
      cloudflareToken: isCloudflareTokenValid,
      clientIP: clientIP,
      timestamp: new Date().toISOString()
    };

    // 处理配置请求
    if (path === '/' || path === '/api/config') {
      // 三重验证模式：必须通过至少两重验证
      const passedValidations = [
        isUserAgentValid,
        isAppTokenValid, 
        isCloudflareTokenValid
      ].filter(Boolean).length;

      if (passedValidations >= 2) {
        // 验证通过，返回配置文件
        try {
          const configResponse = await fetch(CONFIG.JSON_CONFIG_URL);
          
          if (configResponse.ok) {
            const configData = await configResponse.text();
            
            // 记录成功访问
            if (CONFIG.DEBUG_MODE) {
              console.log('三重验证通过:', JSON.stringify(validationResults));
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
            return new Response(JSON.stringify({ error: '无法获取配置文件' }), { 
              status: 500,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        } catch (error) {
          return new Response(JSON.stringify({ error: '服务器内部错误' }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } else {
        // 验证失败
        if (CONFIG.DEBUG_MODE) {
          console.log('验证失败:', JSON.stringify(validationResults));
        }
        
        // 返回详细的错误信息或重定向
        if (path === '/api/config') {
          return new Response(JSON.stringify({
            error: 'Access Denied',
            validation: validationResults,
            required: '至少通过两重验证'
          }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
          });
        } else {
          return Response.redirect(CONFIG.REDIRECT_URL, 302);
        }
      }
    }

    // 管理接口：查看验证状态（需要Cloudflare Token）
    if (path === '/admin/status' && isCloudflareTokenValid) {
      return new Response(JSON.stringify({
        status: 'OK',
        validation: validationResults,
        config: {
          allowedUserAgents: CONFIG.ALLOWED_USER_AGENTS,
          hasAppTokens: CONFIG.VALID_APP_TOKENS.size > 0,
          hasCloudflareToken: !!CONFIG.CLOUDFLARE_API_TOKEN,
          debugMode: CONFIG.DEBUG_MODE
        }
      }, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 健康检查端点
    if (path === '/health') {
      return new Response(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        worker: 'tvbox-config-router'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 其他路径返回404
    return new Response(JSON.stringify({
      error: 'Not Found',
      path: path
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
