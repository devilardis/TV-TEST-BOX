// 最简单的测试版本 - 先确认Worker能运行
export default {
  async fetch(request) {
    return new Response(JSON.stringify({
      message: 'Worker is working!',
      timestamp: new Date().toISOString(),
      url: request.url,
      userAgent: request.headers.get('user-agent') || 'none'
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
