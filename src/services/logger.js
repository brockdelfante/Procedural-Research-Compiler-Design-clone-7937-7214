class Logger {
  constructor() {
    this.logs = [];
    this.listeners = [];
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    this.listeners.forEach(l => l([...this.logs]));
  }

  log(level, message, data = null) {
    const timestamp = new Date().toISOString().slice(11, 19).replace('T', '');
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data: data ? JSON.stringify(data, null, 2) : null  // ✅ AUTO JSON!
    };
    
    this.logs.push(entry);
    this.notify();
    
    // ✅ PRINT TO CONSOLE IMMEDIATELY
    const logLine = `${timestamp} ${level.toUpperCase()}`;
    if (data) {
      console.info(logLine, message);
      console.info(data);  // Pretty-print object
    } else {
      console.info(logLine, message);
    }
  }

  info(msg, data) { this.log('INFO', msg, data); }
  warn(msg, data) { this.log('WARN', msg, data); }
  error(msg, data) { this.log('ERROR', msg, data); }
  debug(msg, data) { this.log('DEBUG', msg, data); }
  
  clear() {
    this.logs = [];
    this.notify();
  }
}

export const systemLog = new Logger();