import { createMiddleware } from 'hono/factory'
import type { MiddlewareHandler } from 'hono'

// Log Levels
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
}

// Interface for structured abstract logger
export interface ILogger {
    debug(message: string, ...args: any[]): void
    info(message: string, ...args: any[]): void
    warn(message: string, ...args: any[]): void
    error(message: string, ...args: any[]): void
}

/**
 * Structured Logger implementation suitable for Edge environments (Workers).
 * Outputs JSON logs.
 */
export class Logger implements ILogger {
    private readonly level: LogLevel
    private readonly context: Record<string, any>

    constructor(level: LogLevel = 'info', context: Record<string, any> = {}) {
        this.level = level
        this.context = context
    }

    private shouldLog(level: LogLevel): boolean {
        return LEVELS[level] >= LEVELS[this.level]
    }

    private getCaller(): string | undefined {
        try {
            const stack = new Error().stack
            if (!stack) return undefined

            const lines = stack.split('\n')
            // 0: Error
            // 1: getCaller
            // 2: log
            // 3: info/warn/debug/error
            // 4: caller
            if (lines.length > 4) {
                return lines[4].trim().replace(/^at\s+/, '')
            }
        } catch (e) {
            // Ignore
        }
        return undefined
    }

    private log(level: LogLevel, message: string, ...args: any[]) {
        if (!this.shouldLog(level)) return

        const timestamp = new Date().toISOString()

        // Combine context and optional args if the first arg is an object
        let logData: Record<string, any> = { ...this.context }
        let msg = message

        if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
            logData = { ...logData, ...args[0] }
        }

        const payload = {
            level,
            timestamp,
            message: msg,
            ...logData,
        }

        // Use console methods appropriately
        // In many edge runtimes, everything goes to stdout/stderr via console

        const caller = this.getCaller()
        if (caller) {
            // @ts-ignore
            payload['caller'] = caller
        }

        switch (level) {
            case 'debug':
                console.debug(JSON.stringify(payload))
                break
            case 'info':
                console.info(JSON.stringify(payload))
                break
            case 'warn':
                console.warn(JSON.stringify(payload))
                break
            case 'error':
                console.error(JSON.stringify(payload))
                break
        }
    }

    debug(message: string, ...args: any[]) {
        this.log('debug', message, ...args)
    }

    info(message: string, ...args: any[]) {
        this.log('info', message, ...args)
    }

    warn(message: string, ...args: any[]) {
        this.log('warn', message, ...args)
    }

    error(message: string, ...args: any[]) {
        this.log('error', message, ...args)
    }

    /**
     * Create a child logger with bound context
     */
    child(context: Record<string, any>): Logger {
        return new Logger(this.level, { ...this.context, ...context })
    }
}

const getLogLevel = (): LogLevel => {
    try {
        if (typeof process !== 'undefined' && process.env?.LOG_LEVEL) {
            return process.env.LOG_LEVEL as LogLevel
        }
    } catch (e) {
        // Ignore errors accessing process
    }
    return 'info'
}

// Default instance
export const logger = new Logger(getLogLevel())

/**
 * Hono Middleware for request logging
 */
export const honoLogger = (customLogger: Logger = logger): MiddlewareHandler => {
    return createMiddleware(async (c, next) => {
        const start = Date.now()
        const { method, path } = c.req

        // Attach requestId if present (e.g. from cloudflare or another middleware)
        const requestId = c.req.header('cf-ray') || c.req.header('x-request-id') || crypto.randomUUID()

        // Add logger to context variable if desired, or just use the closure
        // Bound logger with request context
        const requestLogger = customLogger.child({ requestId })

        // You can also make it available via c.set('logger', requestLogger) if you extend Hono context

        await next()

        const duration = Date.now() - start
        const status = c.res.status

        const logFn = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'

        requestLogger[logFn]('Incoming Request', {
            method,
            path,
            status,
            durationMs: duration,
            userAgent: c.req.header('user-agent'),
        })
    })
}
