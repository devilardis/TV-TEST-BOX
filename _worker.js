// _worker.js - 智能请求识别与路由 (增强Token验证版)
export default {
  async fetch(request, env, ctx) {
    // 配置参数：请根据实际情况修改
    const CONFIG = {
      // 允许访问配置的User-Agent特征（影视仓App通常使用okhttp）
      ALLOWED_USER_AGENTS: ['okhttp/3.12.11','okhttp/3.15', 'tvbox', '影视仓'],
      // 有效的Token列表 (!!! 请务必替换为您自己的Token !!!)
      VALID_TOKENS: new Set([
        'tvbox_sk_abc123def4567890abcdef1234567890', // 示例Token 1，请替换
        'tvbox_sk_098765fedcbazyxwvutsrqponm123456'  // 示例Token 2，请替换
      ]),
      // 您的JSON配置文件的实际地址
      JSON_CONFIG_URL: 'https://devilardis.github.io/TV-TEST-BOX/TEST.json',
      // 非授权请求重定向到的地址
      REDIRECT_URL: 'https://www.baidu.com'
    };

    // 获取请求信息
    const url = new URL(request.url);
    const userAgent = request.headers.get('user-agent') || '';
    const path = url.pathname;
    const token = url.searchParams.get('token'); // 从URL参数获取Token
    const authHeader = request.headers.get('Authorization'); // 从Authorization头获取Token

    // 调试日志（在Cloudflare Dashboard的Logs中可见）
    console.log(`[${new Date().toISOString()}] 请求路径: ${path}, UA: ${userAgent.substring(0, 50)}..., Token: ${token || 'None'}`);

    // 1. Token验证 (最高优先级)
    let isTokenValid = false;
    if (token && CONFIG.VALID_TOKENS.has(token)) {
      isTokenValid = true;
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      const bearerToken = authHeader.substring(7);
      isTokenValid = CONFIG.VALID_TOKENS.has(bearerToken);
    }

    // 2. 处理对根路径（/）的请求
    if (path === '/') {
      const isAllowedClient = CONFIG.ALLOWED_USER_AGENTS.some(ua => userAgent.includes(ua));
      
      // 通过Token验证或User-Agent验证均可
      if (isTokenValid || isAllowedClient) {
        // 识别为合法请求，返回JSON配置
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

    // 3. 显式的配置接口 (强制需要Token)
    if (path === '/api/config') {
      if (!isTokenValid) {
        return new Response('Forbidden: Token required', { status: 403 });
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
