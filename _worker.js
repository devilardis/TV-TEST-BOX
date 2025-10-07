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
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>UA设备管理面板</title>
    <style>
        :root {
            --primary: #3498db;
            --secondary: #2c3e50;
            --success: #2ecc71;
            --danger: #e74c3c;
            --warning: #f39c12;
            --light: #ecff1;
            --dark: #34495e;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        
        body {
            background-color: #f5f7fa;
            color: #333;
            line-height: 1.6;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        
        header {
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            color: white;
            padding: 20px 0;
            border-radius: 8px 8px 0 0;
            margin-bottom: 20px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        
        .header-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 20px;
        }
        
        h1 {
            font-size: 24px;
            font-weight: 600;
        }
        
        .stats {
            display: flex;
            gap: 20;
            margin-bottom: 20px;
        }
        
        .stat-card {
            flex: 1;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, .05);
            text-align: center;
        }
        
        .stat-card h3 {
            color: var(--dark);
            margin-bottom: 10px;
        }
        
        .stat-card .number {
            font-size: 32px;
            font-weight: bold;
            color: var(--primary);
        }
        
        .card {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
            margin-bottom: 20px;
            overflow: hidden;
        }
        
        .card-header {
            background-color: var(--light);
            padding: 15px 20px;
            border-bottom: 1px solid #ddd;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .card-header h2 {
            font-size: 18px;
            color: var(--dark);
        }
        
        .card-body {
            padding: 20px;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
        }
        
        table th, table td {
            padding: 12px 15px;
            text-align: left;
            border-bottom: 1px solid #eee;
      }
        
        table th {
            background-color: #f8f9fa;
            font-weight: 600;
           olor: var(--dark);
        }
        
        table tr:hover {
            background-color: #f8f9fa;
        }
        
        .btn {
            display: inline-block;
            padding: 8px 16px;
            background-color: var(--primary);
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            text-decoration: none;
            transition: background-color 0.2s;
        }
        
        .btn:hover {
            background-color: #2980b9;
        }
        
        .btn-danger {
            background-color: var(--danger);
        }
        
        .btn-danger:hover {
            background-color: #c0392b;
        }
        
        .btn-success {
            background-color: var(--success);
        }
        
        .btn-success:hover {
            background-color: #27ae60;
        }
        
        .form-group {
            margin-bottom: 15px;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
            color: var(--dark);
        }
        
        .form-control {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
        }
        
        .form-control:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
        }
        
        .alert {
            padding: 12px 15px;
            border-radius: 4px;
            margin-bottom: 15px;
        }
        
        .alert-success {
            background-color: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        
        .alert-danger {
            background-color: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        
        .tabs {
            display: flex;
            border-bottom: 1px solid #ddd;
            margin-bottom: 20px;
        }
        
        .tab {
            padding: 10px 20px;
            cursor: pointer;
            border-bottom: 3px solid transparent;
        }
        
        .tab.active {
            border-bottom-color: var(--primary);
            color: var(--primary);
            font-weight: 500;
        }
        
        .tab-content {
            display: none;
        }
        
        .tab-content.active {
            display: block;
        }
        
        .log-entry {
            padding: 10px;
            border-bottom: 1px solid #eee;
            font-family: monospace;
        }
        
        .log-entry:hover {
            background-color: #f8f9fa;
        }
        
        .timestamp {
            color: #6c757d;
            margin-right: 10px;
        }
        
        .ua-match {
            color: var(--success);
            font-weight: 500;
        }
        
        .ua-miss {
            color: var(--danger);
            font-weight: 500;
        }
        
        @media (max-width: 768px) {
            .stats {
                flex-direction: column;
            }
            
            .header-content {
                flex-direction: column;
                text-align: center;
                gap: 10px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div class="header-content">
                <h1>UA设备管理面板</极>
                <div>
                    <span id="current-time"></span>
                </div>
            </div>
        </header>
        
        <div class="stats">
            <div class="stat-card">
                <h3>总规则数</h3>
                <div class="number" id="total-rules">0</div>
            </div>
            <div class="stat-card">
                <h3>今日匹配</h3>
                <div class="number" id="today-matches">0</div>
            </div>
            <div class="stat-card">
                <h3>今日拦截</h3>
                <div class="number" id="today-blocks">0</div>
            </div>
            <div class="stat-card">
                <h3>总请求数</h3>
                <div class="number" id="total-requests">0</div>
            </极>
        </div>
        
        <div class="tabs">
            <div class="tab active" data-tab="rules">UA规则管理</div>
            <div class="tab" data-tab="add-rule">添加规则</div>
            <div class="tab" data-tab="logs">访问日志</div>
            <div class="tab" data-tab="stats">统计信息</div>
        </div>
        
        <div class="tab-content active" id="rules-tab">
            <div class="card">
                <div class="极-header">
                    <h2>UA模式规则列表</h2>
                    <button class="btn" id="refresh-rules">刷新</button>
                </div>
                <div class="card-body">
                    <div id="rules-table-container">
                        <table id="rules-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>模式</th>
                                    <th>类型</th>
                                    <th>描述</th>
                                    <th>创建时间</th>
                                    <th>操作</th>
                                </tr>
                            </thead>
                            <tbody id="rules-body">
                                <!-- 规则数据将通过JavaScript动态加载 -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="tab-content" id="add-rule-tab">
            <div class="card">
                <div class="card-header">
                    <h2极添加UA模式规则</h2>
                </div>
                <div class="card-body">
                    <form id="add-rule-form">
                        <div class="form-group">
                            <label for="pattern">UA模式 (正则表达式)</label>
                            <input type="text" id="pattern" class="form-control" required placeholder="例如: okhttp\\\\/[0-9]+\\\\.[0-9]+">
                        </div>
                        <div class="form-group">
                            <label for="type">类型标识</label>
                            <input type="text" id="type" class="form-control" required placeholder="例如: okhttp">
                        </div>
                        <div class="form-group">
                            <label for="description">描述</label>
                            <input type="text" id="description" class="form-control" required placeholder="例如: OkHttp客户端">
                        </div>
                        <button type="submit" class="btn btn-success">添加规则</button>
                    </form>
                </div>
            </div>
        </div>
        
        <div class="tab-content" id="logs-tab">
            <div class="card">
                <div class="card-header">
                    <h2>最近访问日志</h2>
                    <button class="btn极" id="refresh-logs">刷新</button>
                </div>
                <div class="card-body">
                    <div id="logs-container">
                        <!-- 日志将通过JavaScript动态加载 -->
                    </div>
                </div>
            </div>
        </div>
        
        <div class="tab-content" id="stats-tab">
            <div class="card">
                <div class="card-header">
                    <h2>匹配统计</h2>
                </div>
                <div class="card-body">
                    <canvas id="stats-chart" width="400" height="200"></canvas>
                </div>
            </div>
        </div>
    </div>

    <script>
        // 更新当前时间
        function updateCurrentTime() {
            const now = new Date();
            document.getElementById('current-time').textContent = now.toLocaleString('zh-CN');
        }
        
        setInterval(updateCurrentTime, 1000);
        updateCurrentTime();
        
        // 标签切换功能
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                
                tab.classList.add('active');
                document.getElementById(tab.dataset.tab + '-tab').classList.add('active');
            });
        });
        
        // 从API获取数据
        async function fetchApi(endpoint, options = {}) {
            try {
                const response = await fetch('/admin/api/' + endpoint, options);
                return await response.json();
            } catch (error) {
                console.error('API请求失败:', error);
                return { success: false, error: error.message };
            }
        }
        
        // 加载规则列表
        async function loadRules() {
            const result = await fetchApi('rules');
            if (result.success) {
                const tbody = document.getElementById('rules-body');
                tbody.innerHTML = '';
                
                result.data.forEach(rule => {
                    const row = document.createElement('tr');
                    row.innerHTML = '<td>' + rule.id + '</td>' +
                        '<td>' + rule.pattern + '</td>' +
                        '<td>' + rule.type + '</极>' +
                        '<td>' + rule.description + '</td>' +
                        '<td>' + rule.created_at + '</td>' +
                        '<td>' +
                            '<button class="btn" onclick="editRule(' + rule.id + ')">编辑</button> ' +
                            '<button class="btn btn-danger" onclick="deleteRule(' + rule.id + ')">删除</button>' +
                        '</td>';
                    tbody.appendChild(row);
                });
                
                document.getElementById('total-rules').textContent = result.data.length;
            } else {
                alert('加载规则失败: ' + result.error);
            }
        }
        
        // 加载访问日志
        async function loadLogs() {
            const result = await fetchApi('logs');
            if (result.success) {
                const container = document.getElementById('logs-container');
                container.innerHTML = '';
                
                result.data.forEach(log => {
                    const entry = document.createElement('div');
                    entry.className = 'log-entry';
                    
                    const status = log.matched ? 
                        '<span class="ua-match">✅ 匹配: ' + log.pattern + '</span>' : 
                        '<span class="ua-miss">❌ 未匹配</span>';
                    
                    entry.innerHTML = '<span class="timestamp">' + log.timestamp + '</span>' +
                        '<strong>' + log.ip + '</strong> - ' +
                        '<span>' + log.ua.substring(0, 80) + (log.ua.length > 80 ? '...' : '') + '</span> - ' +
                        status;
                    
                    container.appendChild(entry);
                });
            } else {
                alert('加载日志失败: ' + result.error);
            }
        }
        
        // 加载统计数据
        async function loadStats() {
            const result = await fetchApi('stats');
            if (result.success) {
                document.getElementById('total-rules').textContent = result.data.totalRules;
                document.getElementById('today-matches').textContent = result.data.todayMatches;
                document.getElementById('today-blocks').textContent = result.data.todayBlocks;
                document.getElementById('total-requests').textContent = result.data.totalRequests;
            }
        }
        
        // 表单提交处理
        document.getElementById('add-rule-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const pattern = document.getElementById('pattern').value;
            const type = document.getElementById('type').value;
            const description = document.getElementById('description').value;
            
            const result = await fetchApi('rules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pattern, type, description })
            });
            
            if (result.success) {
                alert('规则添加成功');
                document.getElementById('add-rule-form').reset();
                
                // 切换回规则列表并刷新
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                document.querySelector('.tab[data-tab="rules"]').classList.add('active');
                document.getElementById('rules极ab').classList.add('active');
                
                loadRules();
                loadStats();
            } else {
                alert('添加规则失败: ' + result.error);
            }
        });
        
        // 初始化页面
        document.getElementById('refresh-rules').addEventListener('click', loadRules);
        document.getElementById('refresh-logs').addEventListener('click', loadLogs);
        
        // 初始加载
        loadStats();
        loadRules();
        loadLogs();
        
        // 编辑和删除函数
        window.editRule = function(id) {
            alert('编辑规则 #' + id + ' - 实际应用中会打开编辑表单');
        };
        
        window.deleteRule = async function(id) {
            if (confirm('确定要删除这条规则吗？')) {
                const result = await fetchApi('rules/' + id, { method: 'DELETE' });
                
                if (result.success) {
                    alert('规则删除成功');
                    loadRules();
                    loadStats();
                } else {
                    alert('删除规则失败: ' + result.error);
                }
            }
        };
    </script>
</body>
</html>`;
    
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
          "SELECT id, pattern, type, description, created_at FROM ua极ules ORDER BY created_at DESC"
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
        const { results } = await env.DB极repare(
          "SELECT id, timestamp, ip, ua, matched, pattern FROM access_log ORDER BY timestamp DESC LIMIT 100"
        ).all();
        
        return Response.json({ success: true极 data: results });
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
        for (const { pattern, type, description } of uaPattern极) {
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

    console.log('[Worker] ❌ Cache MISS - Fetching from origin');

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
        
        console.log(`[Worker] ✅ Config fetched and cached for client: ${clientType}`);
        return responseToCache;

    } catch (error) {
        console.error('[Worker] Fetch error:', error);
        
        const staleCachedResponse = await cache.match(cacheKey);
        if (staleCachedResponse) {
            console.log('[Worker] 🔶 Origin down, returning STALE cached config');
            return staleCachedResponse;
        }
        
        return new Response('Internal Server Error: Failed to fetch configuration', {
            status: 500,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
  }
};
