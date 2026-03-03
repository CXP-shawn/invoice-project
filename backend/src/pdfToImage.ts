import { pdf } from 'pdf-to-img';
import fs from 'fs';
import path from 'path';

/**
 * 将 PDF 第一页转换为 PNG 图片
 * @returns 生成的图片文件路径
 */
export async function pdfFirstPageToImage(pdfPath: string, outputDir: string): Promise<string> {
  const doc = await pdf(pdfPath, { scale: 2 });
  const baseName = path.basename(pdfPath, path.extname(pdfPath));
  const outPath = path.join(outputDir, `${baseName}_page1.png`);
  let pageNum = 0;
  for await (const image of doc) {
    pageNum++;
    if (pageNum === 1) {
      fs.writeFileSync(outPath, image);
      return outPath;
    }
  }
  throw new Error('PDF 无有效页面');
}
