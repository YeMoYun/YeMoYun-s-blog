Moyun Logs · CloudBase 上线版

你要的不是“本地能打开”，而是“别人能访问、你能继续发文章”。
这个包就是按这个目标整理的。

一、入口文件
- index.html    主站首页
- blog.html     博客前台
- admin.html    后台入口 / 管理说明页

二、三种模式
1) demo
- 完全本地演示
- 文章和评论都在浏览器 localStorage
- 适合看效果，不适合给别人访问

2) cloudbase-db
- 文章和评论都走云开发数据库
- admin.html 可以直接读写数据库
- 适合你自己测试
- 不建议把 admin.html 暴露给所有人，因为前端静态页做不出真正安全的管理员密钥保护

3) cloudbase-openapi【推荐正式路线】
- 文章由 CloudBase CMS 官方后台发
- 前台 blog.html 通过 CMS Open API 自动读取已发布文章
- 评论可选走云开发数据库 comments 集合
- 这才是“你在后台发文章，前台自动更新，别人可以访问”的长期方案

三、推荐你最终用法
1. 打开 js/cms-config.js
2. 把 mode 改成 'cloudbase-openapi'
3. 在腾讯云 CloudBase 里安装 CMS 模板
4. 创建 CMS 项目和 posts 内容模型
5. 在项目设置 -> API 访问 里开启 posts 集合的 Open API
6. 把 env / region / kitId / projectId / collectionId 填进 js/cms-config.js
7. 把 cmsOpenApi.adminUrl 改成你的 CMS 管理端地址
8. 如果要线上评论：
   - 打开 cloudbase.enabled = true
   - 填 cloudbase.env
   - 打开 cloudbase.commentsEnabled = true
   - 建 comments 集合
9. 把整个网站部署到 CloudBase 静态托管
10. 绑定自定义域名，正式环境建议备案

四、建议的 posts 字段
- title        标题
- slug         链接标识
- excerpt      摘要
- content      正文（建议长文本或 Markdown 文本）
- category     分类
- tags         标签（数组或逗号字符串）
- published    是否公开
- publishedAt  发布时间
- status       published / draft
- updatedAt    更新时间

五、建议的 comments 字段
- postSlug     文章 slug
- name         评论者名字
- contact      联系方式（可选）
- content      评论内容
- createdAt    创建时间
- approved     是否通过审核

六、上线注意
- CloudBase 官方文档说明：默认域名只适合开发测试，生产环境强烈建议绑定已备案的自定义域名
- CMS Open API 官方文档说明：Open API 约有一分钟缓存，后台更新后不是绝对秒级刷新
- 如果你用自定义根路径，请记得同步调整资源引用路径

七、你接下来最该做的
- 别再继续磨视觉
- 先真正发 3~5 篇文章
- 把“写文章 -> 发布 -> 前台显示”这条链路跑通
