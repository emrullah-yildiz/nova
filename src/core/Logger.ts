export type LogLevel = 'INFO' | 'WARN' | 'ERROR'

interface LogEntry {
  ts: number
  level: LogLevel
  cat: string
  msg: string
}

class Logger {
  private entries: LogEntry[] = []
  private start = Date.now()

  info(cat: string, msg: string): void { this.log('INFO', cat, msg) }
  warn(cat: string, msg: string): void { this.log('WARN', cat, msg) }
  error(cat: string, msg: string): void { this.log('ERROR', cat, msg); console.error(`[Nova:${cat}] ${msg}`) }

  private log(level: LogLevel, cat: string, msg: string): void {
    this.entries.push({ ts: Date.now() - this.start, level, cat, msg })
    if (level !== 'ERROR') console.log(`[Nova:${cat}] ${msg}`)
  }
}

export const logger = new Logger()
