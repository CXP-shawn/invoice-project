import mysql from 'mysql2/promise';
import { config } from './config.js';

let pool: mysql.Pool | null = null;

export async function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: config.mysql.host,
      port: config.mysql.port,
      user: config.mysql.user,
      password: config.mysql.password,
      database: config.mysql.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }
  return pool;
}

export interface Invoice {
  id: number;
  invoice_code: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  seller_name: string | null;
  seller_tax_id: string | null;
  buyer_name: string | null;
  buyer_tax_id: string | null;
  amount: number;
  tax_amount: number;
  total_amount: number;
  goods_name: string | null;
  image_path: string;
  raw_text: string | null;
  created_at: string;
}
