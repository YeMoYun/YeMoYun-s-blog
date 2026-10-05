# 腾讯云部署

推荐方案：腾讯云轻量应用服务器。

原因：
- 当前项目是 `Node.js + 本地 JSON 数据文件`
- 不需要改造成云函数或云数据库
- 适合直接部署在一台 Linux 主机上，由 `PM2 + Nginx` 托管

## 1. 购买建议

- 产品：腾讯云轻量应用服务器
- 地域：选离主要访问用户近的地域；如果用户主要在中国大陆，优先中国大陆地域
- 系统：`Ubuntu 22.04 LTS`
- 规格：博客站点最小可从 `2核 2G` 起步

官方页面：
- 轻量应用服务器产品页: https://cloud.tencent.com/product/lighthouse
- 轻量应用服务器价格页: https://cloud.tencent.com/product/lighthouse/pricing
- 轻量应用服务器文档中心: https://cloud.tencent.com/document/product/1207

## 2. 本地打包

在项目根目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package-tencent.ps1
```

会生成：

```text
dist/moyun-blog-tencent.zip
```

## 3. 上传到服务器

把压缩包上传到服务器，例如：

```bash
scp moyun-blog-tencent.zip root@your-server-ip:/root/
```

然后在服务器执行：

```bash
mkdir -p /var/www/moyun-blog
apt update
apt install -y unzip nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pm2
cd /var/www/moyun-blog
unzip /root/moyun-blog-tencent.zip
```

## 4. 启动 Node 服务

```bash
cd /var/www/moyun-blog
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

健康检查：

```bash
curl http://127.0.0.1:8093/api/health
```

## 5. 配置 Nginx

把项目里的 `nginx.conf.example` 复制到：

```bash
/etc/nginx/sites-available/moyun-blog.conf
```

启用配置：

```bash
ln -sf /etc/nginx/sites-available/moyun-blog.conf /etc/nginx/sites-enabled/moyun-blog.conf
nginx -t
systemctl restart nginx
```

现在访问服务器公网 IP 即可打开站点。

## 6. 域名与 HTTPS

如果你有域名：
- 把域名 A 记录指向轻量服务器公网 IP
- 在腾讯云或其他证书提供方申请 SSL 证书
- 再把 Nginx 改成 `443 + HTTPS`

如果网站面向中国大陆公众访问：
- 需要按腾讯云要求处理备案

参考：
- 域名备案相关文档入口: https://cloud.tencent.com/document/product/243

## 7. 发布新文章

部署后文章数据保存在：

```text
/var/www/moyun-blog/data/posts.json
```

后台页面保存文章后，前台会按当前配置自动轮询刷新。

## 8. 后续可选优化

- 把文章数据从 JSON 升级到 MySQL 或 PostgreSQL
- 增加图片上传
- 增加管理后台真正的服务端鉴权
- 配置自动备份 `data/posts.json`
