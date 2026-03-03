import 'dotenv/config';
import path from 'path';

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  mysql: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'invoice_db',
  },
  uploadDir: process.env.UPLOAD_DIR || path.resolve(process.cwd(), '..', 'uploads'),
};
