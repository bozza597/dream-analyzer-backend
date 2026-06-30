import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import { readFile } from "../util/file";

export class FileAdapter {
  constructor() { }

  async saveFile(arrayBuffer: ArrayBuffer, fileName: string) {
    const buffer = Buffer.from(arrayBuffer);
    const destFileName = `${randomUUID()}-${fileName}`
    const uploadsDir = process.env.NODE_ENV === "production" ? '/tmp' : path.join(process.cwd(), 'uploads')

    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filePath = path.join(uploadsDir, destFileName)
    fs.writeFileSync(filePath, buffer);

    return filePath
  }

  async getBase64(filePath: string) {
    const buffer = await readFile(filePath)
    const base64 = buffer.toString('base64')
    return base64
  }
}