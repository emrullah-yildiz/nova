import fs from 'node:fs';
import path from 'node:path';

export class JsonFilePersistence {
  constructor(filePath) {
    if (!filePath) throw new Error('JsonFilePersistence requires a file path.');
    this.filePath = filePath;
  }

  readSnapshot() {
    if (!fs.existsSync(this.filePath)) return null;
    const raw = fs.readFileSync(this.filePath, 'utf8');
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  }

  writeSnapshot(snapshot) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempPath = this.filePath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(snapshot, null, 2));
    fs.renameSync(tempPath, this.filePath);
  }
}
