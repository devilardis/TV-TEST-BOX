// 最新ES模块语法（必须使用export default）
export default {
  async fetch(request, env, ctx) {
    // 配置参数
    const TARGET_UA = 'okhttp/3.12.11';
    const JSON_URL = 'https://devilardis.github.io/TV-TEST-BOX/TEST.json';
    const REDIRECT_URL = 'https://www.baidu.com';

    // 获取请求信息
    const ua = request.headers.get('user-agent') || '';
    const url = new URL(request.url);
    
    // 调试日志（在Dashboard的Logs中查看）
    console.log('请求来源:', {
      ua: ua,
      ip: request.headers.get('cf-connecting-ip'),
      country: request.headers.get('cf-ipcountry')
    });

    // 1. 影视仓请求处理
    if (ua.includes(TARGET_UA)) {
      try {
        // 使用现代fetch API
        const response = await fetch(JSON_URL, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': TARGET_UA
          },
          cf: {
            // Cloudflare特定配置
            cacheEverything: true,
            cacheTtl: 3600 // 缓存1小时
          }
        });

        // 返回JSON响应
        return new Response(response.body, {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'max-age=3600',
            'Access-Control-Allow-Origin': '*'
          }
        });

      } catch (error) {
        // 错误处理
        return new Response(JSON.stringify({ error: '配置获取失败' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // 2. 其他请求重定向
    return Response.redirect(REDIRECT_URL, 302);
  }
}
