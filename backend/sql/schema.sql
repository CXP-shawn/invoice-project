-- 发票管理系统数据库表结构
-- MySQL 5.6+

CREATE DATABASE IF NOT EXISTS invoice_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE invoice_db;

CREATE TABLE IF NOT EXISTS invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_code VARCHAR(50) COMMENT '发票代码',
  invoice_number VARCHAR(50) COMMENT '发票号码',
  invoice_date DATE COMMENT '开票日期',
  seller_name VARCHAR(200) COMMENT '销方名称',
  seller_tax_id VARCHAR(50) COMMENT '销方税号',
  buyer_name VARCHAR(200) COMMENT '购方名称',
  buyer_tax_id VARCHAR(50) COMMENT '购方税号',
  amount DECIMAL(15, 2) DEFAULT 0 COMMENT '金额',
  tax_amount DECIMAL(15, 2) DEFAULT 0 COMMENT '税额',
  total_amount DECIMAL(15, 2) DEFAULT 0 COMMENT '价税合计',
  goods_name VARCHAR(500) COMMENT '商品/服务名称',
  image_path VARCHAR(500) NOT NULL COMMENT '发票图片存储路径',
  raw_text TEXT COMMENT 'OCR 原始识别文本',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_invoice_date (invoice_date),
  INDEX idx_total_amount (total_amount),
  FULLTEXT INDEX ft_search (invoice_code, invoice_number, seller_name, buyer_name, goods_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='发票信息表';
