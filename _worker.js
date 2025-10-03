// _worker.js - 智能请求识别 (仅User-Agent验证版)
export default {
  async fetch(request, env, ctx) {
    // 配置参数：仅保留非敏感信息
    const CONFIG = {
      // 允许访问配置的User-Agent特征（影视仓App通常使用okhttp）
      ALLOWED_USER_AGENTS: ['okhttp', 'tvbox', '影视仓'],
      
      // 非授权请求重定向到的地址
      REDIRECT_URL: 'https://www.baidu.com'
    };

    // 从环境变量获取配置文件地址（敏感信息不暴露在代码中）
    const JSON_CONFIG_URL = env.JSON_CONFIG_URL;

    // 获取请求信息
    const url = new URL(request.url);
    const userAgent = request.headers.get('user-agent') || '';
    const path = url.pathname;

    // 调试日志
    console.log(`[${new Date().toISOString()}] 请求路径: ${path}, UA: ${userAgent.substring(0, 50)}...`);

    // 1. 单一验证：仅User-Agent验证
    const isAllowedClient = CONFIG.ALLOWED_USER_AGENTS.some(ua => userAgent.includes(ua));

    // 2. 处理对根路径（/）的请求
    if (path === '/') {
      // 仅需满足User-Agent验证
      if (isAllowedClient) {
        // 验证通过，返回JSON配置
        try {
          const configResponse = await fetch(JSON_CONFIG_URL);
          
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
        console.log('验证失败：User-Agent不匹配');
        return Response.redirect(CONFIG.REDIRECT_URL, 302);
      }
    }

    // 3. 显式的配置接口 (同样仅需User-Agent验证)
    if (path === '/api/config') {
      if (!isAllowedClient) {
        return new Response('Forbidden: Valid User-Agent required', { status: 403 });
      }
      
      const configResponse = await fetch(JSON_CONFIG_URL);
      const configData = await configResponse.text();
      return new Response(configData, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }

    // 4. 健康检查端点（无需验证）
    if (path === '/health') {
      return new Response(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        worker: 'tvbox-config-router',
        config: {
          hasUserAgents: CONFIG.ALLOWED_USER_AGENTS.length > 0,
          configUrlSet: !!JSON_CONFIG_URL
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 5. 对于其他未知路径，返回404
    return new Response('Not Found', { status: 404 });
  }
};
