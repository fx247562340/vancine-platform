# Vancine UTM 来源追踪配置指南

## 一、什么是 UTM 参数

UTM（Urchin Tracking Module）参数是附加在 URL 后面的追踪标记，用于区分不同渠道的流量来源。

### UTM 参数说明

| 参数 | 说明 | 示例 |
|------|------|------|
| `utm_source` | 流量来源 | reddit, v2ex, twitter |
| `utm_medium` | 媒介类型 | social, blog, email |
| `utm_campaign` | 活动名称 | launch, tutorial, benchmark |
| `utm_content` | 内容标识 | button, link, banner |
| `utm_term` | 关键词（可选） | ai-api, chinese-models |

---

## 二、各渠道 UTM 配置

### 1. Reddit

**帖子链接**：
```
https://vancine.com?utm_source=reddit&utm_medium=social&utm_campaign=launch&utm_content=post_link
```

**签名链接**：
```
https://vancine.com?utm_source=reddit&utm_medium=social&utm_campaign=launch&utm_content=signature
```

### 2. Hacker News (Show HN)

```
https://vancine.com?utm_source=hackernews&utm_medium=social&utm_campaign=show_hn
```

### 3. V2EX

```
https://vancine.com?utm_source=v2ex&utm_medium=social&utm_campaign=launch&utm_content=topic
```

### 4. 技术博客

**掘金**：
```
https://vancine.com?utm_source=juejin&utm_medium=blog&utm_campaign=tutorial&utm_content=article
```

**知乎**：
```
https://vancine.com?utm_source=zhihu&utm_medium=blog&utm_campaign=tutorial&utm_content=answer
```

**SegmentFault**：
```
https://vancine.com?utm_source=segmentfault&utm_medium=blog&utm_campaign=tutorial
```

### 5. GitHub

**README 链接**：
```
https://vancine.com?utm_source=github&utm_medium=readme&utm_campaign=open_source
```

**Issue 链接**：
```
https://vancine.com?utm_source=github&utm_medium=issue&utm_campaign=support
```

### 6. 社交媒体

**Twitter/X**：
```
https://vancine.com?utm_source=twitter&utm_medium=social&utm_campaign=launch
```

**小红书**：
```
https://vancine.com?utm_source=xiaohongshu&utm_medium=social&utm_campaign=launch
```

### 7. 邮件

```
https://vancine.com?utm_source=email&utm_medium=email&utm_campaign=newsletter
```

---

## 三、快速生成 UTM 链接

### 方式一：手动拼接

```
基础 URL + ? + utm_source=xxx & utm_medium=xxx & utm_campaign=xxx
```

### 方式二：使用工具

- Google Campaign URL Builder: https://ga-dev-tools.google/campaign-url-builder/
- UTM.io: https://utm.io/

### 方式三：脚本生成

```python
def generate_utm_url(base_url, source, medium, campaign, content=None):
    """生成 UTM 链接"""
    params = {
        'utm_source': source,
        'utm_medium': medium,
        'utm_campaign': campaign,
    }
    if content:
        params['utm_content'] = content
    
    query = '&'.join(f"{k}={v}" for k, v in params.items())
    return f"{base_url}?{query}"

# 示例
print(generate_utm_url(
    'https://vancine.com',
    'reddit',
    'social',
    'launch',
    'post_link'
))
# 输出: https://vancine.com?utm_source=reddit&utm_medium=social&utm_campaign=launch&utm_content=post_link
```

---

## 四、追踪指标

### 关键指标

| 指标 | 说明 | 目标 |
|------|------|------|
| 访问量 | 各渠道带来的访问次数 | — |
| 注册转化率 | 访问 → 注册的比例 | >5% |
| 首次调用率 | 注册 → 首次调用的比例 | >30% |
| 充值转化率 | 首次调用 → 充值的比例 | >10% |

### 各渠道预期效果

| 渠道 | 预期访问 | 预期注册 | 预期调用 | 预期充值 |
|------|----------|----------|----------|----------|
| Reddit | 100-500 | 5-25 | 2-10 | 0-3 |
| Hacker News | 200-1000 | 10-50 | 5-20 | 1-5 |
| V2EX | 50-200 | 3-10 | 1-5 | 0-2 |
| 技术博客 | 50-300 | 3-15 | 1-8 | 0-3 |
| GitHub | 20-100 | 1-5 | 0-3 | 0-1 |

---

## 五、数据查看

### Umami Analytics

如果已配置 Umami，可以在 Umami 后台查看：
1. 访问 https://analytics.vancine.com
2. 选择网站
3. 查看「来源」报告
4. 按 utm_source 分组查看

### Google Analytics

如果已配置 GA4，可以在 Google Analytics 后台查看：
1. 访问 https://analytics.google.com
2. 报告 → 流量获取 → 流量获取
3. 按「会话来源/媒介」分组查看

### 自建追踪

在数据库中记录用户注册来源：

```sql
-- 在 users 表添加字段
ALTER TABLE users ADD COLUMN utm_source VARCHAR(50);
ALTER TABLE users ADD COLUMN utm_medium VARCHAR(50);
ALTER TABLE users ADD COLUMN utm_campaign VARCHAR(50);

-- 查询各渠道注册数
SELECT 
    utm_source,
    COUNT(*) as registrations
FROM users
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY utm_source
ORDER BY registrations DESC;
```

---

## 六、最佳实践

1. **一致性** — 同一渠道使用相同的 source 名称
2. **小写** — UTM 参数使用小写字母
3. **下划线** — 多个单词用下划线连接（不要用空格或连字符）
4. **记录** — 维护一个 UTM 参数清单，避免重复
5. **测试** — 发布前测试链接是否正确跳转

---

## 七、UTM 参数清单

| 渠道 | utm_source | utm_medium | utm_campaign |
|------|------------|------------|--------------|
| Reddit | reddit | social | launch |
| Hacker News | hackernews | social | show_hn |
| V2EX | v2ex | social | launch |
| 掘金 | juejin | blog | tutorial |
| 知乎 | zhihu | blog | tutorial |
| GitHub | github | readme | open_source |
| Twitter | twitter | social | launch |
| 邮件 | email | email | newsletter |

---

*文档版本：v1.0*
*更新日期：2026-06-09*
