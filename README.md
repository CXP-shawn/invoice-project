# 发票管理系统

实现发票的**上传、识别、存储、统计和查询**功能。

## 功能

- **上传**：支持 jpg、png、gif、bmp、webp 格式发票图片上传
- **识别**：OCR 提取发票关键要素（代码、号码、日期、销方、购方、金额等），与图片一同存储
- **查询**：按日期范围检索、文字模糊查找、点击单条展示发票图片
- **统计**：按日期+关键词统计，显示发票总张数和总金额

## 技术栈

- 前端：React 18 + TypeScript + Ant Design + Vite
- 后端：Node.js + Express + TypeScript
- 数据库：MySQL 5.6+
- OCR：PaddleOCR（可选，未安装时使用模拟数据）

## 快速开始

### 1. 初始化数据库

确保已安装 MySQL 5.6+，使用 Navicat 或命令行执行：

```bash
mysql -u root -p < backend/sql/schema.sql
```

### 2. 配置环境变量

复制 `backend/.env.example` 为 `backend/.env`，修改数据库连接：

```
MYSQL_USER=root
MYSQL_PASSWORD=你的密码
```

### 3. 安装依赖并启动

```bash
# 安装依赖
cd backend && npm install
cd ../frontend && npm install

# 启动后端（在 backend 目录）
cd backend && npm run dev

# 启动前端（新开终端，在 frontend 目录）
cd frontend && npm run dev
```

访问 http://localhost:5173 使用系统。

### 4. 启用真实 OCR（可选）

安装 Python 3 和 PaddleOCR：

```bash
pip install paddleocr paddlepaddle
```

安装后，上传的发票将使用 PaddleOCR 进行真实识别；未安装时使用模拟数据。

## 项目结构

```
invoice-project/
├── frontend/          # React 前端
├── backend/           # Express 后端
│   ├── src/
│   ├── ocr/           # Python OCR 脚本
│   └── sql/           # 数据库脚本
├── uploads/           # 发票图片存储
└── docs/              # 需求与设计文档
```

## 许可证

MIT
