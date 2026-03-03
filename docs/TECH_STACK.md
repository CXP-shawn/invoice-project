# 技术栈配置

## 最终选型

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端 | React | 18.x |
| 前端 | TypeScript | 5.x |
| 前端 | Ant Design | 5.x |
| 前端 | Vite | 5.x |
| 后端 | Node.js | 18+ |
| 后端 | Express | 4.x |
| 后端 | TypeScript | 5.x |
| OCR | PaddleOCR | 或 百度/腾讯云 API |
| 数据库 | MySQL | 5.6+ |
| 工具 | Navicat | 数据库管理 |

## 依赖清单

### 前端 (package.json)
- react, react-dom
- antd
- @ant-design/icons
- axios
- dayjs
- vite, @vitejs/plugin-react
- typescript

### 后端 (package.json)
- express
- multer（文件上传）
- mysql2
- cors
- dotenv
- paddleocr 或 对应云 API SDK

### 数据库
- MySQL 5.6+
- Navicat（本地开发）

## 目录结构规划

```
invoice-project/
├── docs/                 # 文档
├── frontend/             # 前端 React 应用
├── backend/              # 后端 Node 服务
├── uploads/              # 发票图片存储（gitignore）
└── README.md
```
