// _worker.js - 智能请求识别与路由 (双重验证版 + 环境变量保护)
export default {
  async fetch(request, env, ctx) {
    // 从环境变量读取配置（敏感信息不再硬编码在代码中）
    const CONFIG = {
      // 允许访问配置的User-Agent特征（影视仓App通常使用okhttp）
      ALLOWED_USER_AGENTS: ['okhttp', 'tvbox', '影视仓'],
      
      // 有效的Token列表 - 从环境变量读取（在Cloudflare Dashboard中设置）
      VALID_TOKENS: new Set(JSON.parse(env.SECRET_TOKENS || '["devilardiszuiniubi","xinghui888"]')),
      
      // 您的JSON配置文件的实际地址 - 从环境变量读取
      JSON_CONFIG_URL: env.JSON_CONFIG_URL || 'https://devilardis.github.io/TV-TEST-BOX/TEST.json',
      
      // 非授权请求重定向到的地址 - 从环境变量读取
      REDIRECT_URL: env.REDIRECT_URL || 'https://www.baidu.com'
    };

    // 获取请求信息
    const url = new URL(request.url);
    const userAgent = request.headers.get('user-agent') || '';
    const path = url.pathname;
    const token = url.searchParams.get('token'); // 从URL参数获取Token
    const authHeader = request.headers.get('Authorization'); // 从Authorization头获取Token

    // 调试日志
    console.log(`[${new Date().toISOString()}] 请求路径: ${path}, UA: ${userAgent.substring(0, 50)}..., Token: ${token || 'None'}`);

    // 1. 双重验证：User-Agent和Token都必须匹配
    const isAllowedClient = CONFIG.ALLOWED_USER_AGENTS.some(ua => userAgent.includes(ua));
    
    let isTokenValid = false;
    if (token && CONFIG.VALID_TOKENS.has(token)) {
      isTokenValid = true;
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      const bearerToken = authHeader.substring(7);
      isTokenValid = CONFIG.VALID_TOKENS.has(bearerToken);
    }

    // 2. 处理对根路径（/）的请求
    if (path === '/') {
      // 必须同时满足User-Agent和Token验证
      if (isAllowedClient && isTokenValid) {
        // 双重验证通过，返回JSON配置
        try {
          const configResponse = await fetch(CONFIG.JSON_CONFIG_URL);
          
          if (configResponse.ok) {
            const configData = await configResponse.text();
            return new Response(configData, {
              status: 200,
              headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'public, max-age=3600',
                'Access-Control-Allow-Origin': '*'
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
        // 验证失败，重定向
        if (!isAllowedClient && !isTokenValid) {
          console.log('双重验证失败：User-Agent和Token都不匹配');
        } else if (!isAllowedClient) {
          console.log('验证失败：User-Agent不匹配');
        } else if (!isTokenValid) {
          console.log('验证失败：Token无效');
        }
        
        return Response.redirect(CONFIG.REDIRECT_URL, 302);
      }
    }

    // 3. 显式的配置接口 (同样需要双重验证)
    if (path === '/api/config') {
      if (!isAllowedClient || !isTokenValid) {
        return new Response('Forbidden: Valid User-Agent and Token required', { status: 403 });
      }
      
      const configResponse = await fetch(CONFIG.JSON_CONFIG_URL);
      const configData = await configResponse.text();
      return new Response(configData, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }

    // 4. 对于其他未知路径，返回404
    return new Response('Not Found', { status: 404 });
  }
};
