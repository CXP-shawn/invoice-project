#!/usr/bin/env node
/**
 * 测试 MySQL 连接
 * 运行: node scripts/test-db.js
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

async function test() {
  const config = {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'invoice_db',
  };
  console.log('尝试连接:', { host: config.host, port: config.port, user: config.user, database: config.database });
  try {
    const conn = await mysql.createConnection(config);
    const [rows] = await conn.execute('SELECT 1');
    console.log('✓ 连接成功');
    const [tables] = await conn.execute("SHOW TABLES LIKE 'invoices'");
    console.log('✓ invoices 表存在:', tables.length > 0);
    await conn.end();
  } catch (e) {
    console.error('✗ 连接失败:', e.message);
    if (e.code === 'ECONNREFUSED') {
      console.log('\n可能原因:');
      console.log('  1. MySQL 未启动 - 请先启动 MySQL 服务');
      console.log('  2. 使用远程 MySQL - 在 .env 中把 MYSQL_HOST 改为服务器地址');
      console.log('  3. 端口错误 - 确认 MYSQL_PORT 与 MySQL 实际端口一致');
      console.log('\n若 Navicat 能连接，请把 Navicat 中的「主机」填到 .env 的 MYSQL_HOST');
    }
    if (e.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log('\n用户名或密码错误，请检查 .env 中的 MYSQL_USER 和 MYSQL_PASSWORD');
    }
    if (e.code === 'ER_BAD_DB_ERROR') {
      console.log('\n数据库 invoice_db 不存在，请在 Navicat 中执行 backend/sql/schema.sql');
    }
    process.exit(1);
  }
}
test();
