// _worker.js - 智能请求识别与路由
export default {
  async fetch(request, env, ctx) {
    // 配置参数：请根据实际情况修改
    const CONFIG = {
      // 允许访问配置的User-Agent特征（影视仓App通常使用okhttp）
      ALLOWED_USER_AGENTS: ['okhttp/3.12.11', 'tvbox', '影视仓'],
      // 您的JSON配置文件的实际地址（可以是GitHub Raw地址或其他可访问的URL）
      JSON_CONFIG_URL: 'https://devilardis.github.io/TV-TEST-BOX/TEST.json',
      // 非授权请求重定向到的地址
      REDIRECT_URL: 'https://www.baidu.com'
    };

    // 获取请求信息
    const url = new URL(request.url);
    const userAgent = request.headers.get('user-agent') || '';
    const path = url.pathname;

    // 调试日志（在Cloudflare Dashboard的Logs中可见）
    console.log(`[${new Date().toISOString()}] 请求路径: ${path}, UA: ${userAgent.substring(0, 50)}...`);

    // 1. 处理对根路径（/）的请求
    if (path === '/') {
      const isAllowedClient = CONFIG.ALLOWED_USER_AGENTS.some(ua => userAgent.includes(ua));
      
      if (isAllowedClient) {
        // 识别为影视仓App，返回JSON配置
        try {
          const configResponse = await fetch(CONFIG.JSON_CONFIG_URL);
          
          if (configResponse.ok) {
            const configData = await configResponse.text();
            return new Response(configData, {
              status: 200,
              headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'public, max-age=3600', // 缓存1小时
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
        // 非影视仓请求（如浏览器），重定向
        return Response.redirect(CONFIG.REDIRECT_URL, 302);
      }
    }

    // 2. 可以添加其他路径的处理逻辑，例如提供一个显式的配置接口
    if (path === '/api/config') {
      // 此接口无论User-Agent为何，都返回配置（或可在此添加其他验证）
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

    // 3. 对于其他未知路径，返回404或重定向
    return new Response('Not Found', { status: 404 });
    // 或者重定向到首页逻辑：return fetch(request.url.replace(path, '/'));
  }
};
