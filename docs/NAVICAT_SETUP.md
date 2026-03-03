# Navicat 连接与数据库初始化指南

## 无法连接 MySQL 时

**若报错「无法连接 MySQL」**，请先确认：

1. **本机 MySQL**：MySQL 是否已启动？macOS 可在「系统偏好设置」或用 `brew services list` 查看
2. **远程 MySQL**：若你用 Navicat 连接的是远程服务器（如 simen_server），请在 `backend/.env` 中把 `MYSQL_HOST` 改为该服务器的**主机地址**（与 Navicat 中一致）
3. **测试连接**：在 backend 目录运行 `node scripts/test-db.js` 可快速测试配置是否正确

---

## 一、用 Navicat 新建 MySQL 连接

1. 点击 **「新建连接」** → 选择 **「MySQL」** → 点击 **「下一步」**

2. 填写连接信息（**与 .env 保持一致**）：

   | 字段 | 填写值 |
   |------|--------|
   | 连接名 | `invoice_db`（可自定义） |
   | 主机 | `localhost` 或远程服务器 IP/域名 |
   | 端口 | `3306` |
   | 用户名 | `root` |
   | 密码 | 你的 MySQL 密码 |

3. 点击 **「测试连接」**，成功后再点击 **「保存」**

---

## 二、初始化数据库（执行 schema.sql）

1. 在 Navicat 左侧连接列表中，**双击** 刚创建的连接，建立连接

2. 右键该连接 → 选择 **「新建查询」**（或按 `Cmd/Ctrl + Q`）

3. 打开项目中的 `backend/sql/schema.sql` 文件，将其**全部内容**复制到查询窗口

4. 点击 **「运行」**（或按 `Cmd/Ctrl + R`）执行 SQL

5. 执行成功后，左侧会多出数据库 `invoice_db` 和表 `invoices`

---

## 三、配置 .env 与 Navicat 保持一致

确保 `backend/.env` 中的数据库信息与 Navicat 连接一致：

```
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=你的MySQL密码
MYSQL_DATABASE=invoice_db
```

**重要**：把 `MYSQL_PASSWORD=` 改成你 Navicat 连接时使用的密码，否则后端无法连接数据库。

---

## 四、验证

- 在 Navicat 中展开 `invoice_db` → `表`，应能看到 `invoices` 表
- 启动后端：`cd backend && npm run dev`，无报错即表示连接成功
