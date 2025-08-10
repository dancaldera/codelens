import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    const servicePrefix = service ? `[${service}]` : '';
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${servicePrefix} ${level}: ${message}${metaStr}`;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create the main logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'visual-context-analyzer' },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat,
      level: process.env.NODE_ENV === 'development' ? 'debug' : 'info'
    }),
    
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logsDir, 'app.log'),
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    
    // Separate file for errors
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  ],
  
  // Handle uncaught exceptions and unhandled rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      format: fileFormat
    })
  ],
  
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      format: fileFormat
    })
  ]
});

// Create specialized loggers for different components
export const createLogger = (service: string) => {
  return logger.child({ service });
};

// Export the main logger
export default logger;

// Convenience methods for quick logging
export const log = {
  debug: (message: string, meta?: any) => logger.debug(message, meta),
  info: (message: string, meta?: any) => logger.info(message, meta),
  warn: (message: string, meta?: any) => logger.warn(message, meta),
  error: (message: string, meta?: any) => logger.error(message, meta),
};

// Performance logging utility
export const logPerformance = (operation: string, startTime: number, meta?: any) => {
  const duration = Date.now() - startTime;
  logger.info(`Performance: ${operation}`, {
    duration: `${duration}ms`,
    ...meta
  });
};

// API call logging utility
export const logApiCall = (
  method: string,
  endpoint: string,
  statusCode?: number,
  duration?: number,
  meta?: any
) => {
  const level = statusCode && statusCode >= 400 ? 'error' : 'info';
  logger.log(level, `API Call: ${method} ${endpoint}`, {
    method,
    endpoint,
    statusCode,
    duration: duration ? `${duration}ms` : undefined,
    ...meta
  });
};