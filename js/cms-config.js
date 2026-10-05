window.CMS_CONFIG = {
  // demo: 本地浏览器演示模式
  // cloudbase-db: 文章/评论都直接读写云开发数据库（适合测试，不建议把 admin.html 暴露给所有人）
  // cloudbase-openapi: 推荐正式路线。文章通过 CloudBase CMS Open API 公开读取，发文在官方 CMS 管理端完成；评论可选走云开发数据库。
  // node-api: 当前上线版本使用同源 API，文章和评论保存在这台机器的 JSON 文件中。
  mode: 'node-api',
  siteName: 'Moyun Logs',
  adminPassword: '123456',
  exposeAdminEntry: false,
  refreshIntervalMs: 15000,
  api: {
    baseUrl: '/api'
  },

  cloudbase: {
    enabled: false,
    env: 'cloude-d6g9luk487fb4fa68',
    region: 'ap-shanghai',
    postsCollection: 'posts',
    commentsCollection: 'comments',
    commentsEnabled: false,
    sdkCdn: '//imgcache.qq.com/qcloud/tcbjs/1.7.0/tcb.js'
  },

  cmsOpenApi: {
    enabled: false,
    env: 'replace-with-your-env-id',
    region: 'ap-shanghai',
    kitId: 'replace-with-kit-id',
    projectId: 'replace-with-project-id',
    collectionId: 'replace-with-collection-id',
    // 正式发文后台地址。建议填 CloudBase CMS 管理端地址，admin.html 会直接跳转过去。
    adminUrl: 'https://tcb.cloud.tencent.com/',
    // 如你已经在 CMS 里复制了完整的 Open API 链接，也可以直接粘到这里，优先级最高。
    openApiUrl: ''
  }
};
