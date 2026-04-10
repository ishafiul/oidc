export interface ILogger {
	debug(message: string, meta?: Record<string, unknown>): void;
	info(message: string, meta?: Record<string, unknown>): void;
	warn(message: string, meta?: Record<string, unknown>): void;
	error(message: string, error?: Error, meta?: Record<string, unknown>): void;
}

export class NoOpLogger implements ILogger {
	debug(_message: string, _meta?: Record<string, unknown>): void {}
	info(_message: string, _meta?: Record<string, unknown>): void {}
	warn(_message: string, _meta?: Record<string, unknown>): void {}
	error(_message: string, _error?: Error, _meta?: Record<string, unknown>): void {}
}

export class ConsoleLogger implements ILogger {
	constructor(private readonly prefix: string = '[FGAC]') {}

	debug(message: string, meta?: Record<string, unknown>): void {
		console.debug(`${this.prefix} ${message}`, meta ?? '');
	}

	info(message: string, meta?: Record<string, unknown>): void {
		console.info(`${this.prefix} ${message}`, meta ?? '');
	}

	warn(message: string, meta?: Record<string, unknown>): void {
		console.warn(`${this.prefix} ${message}`, meta ?? '');
	}

	error(message: string, error?: Error, meta?: Record<string, unknown>): void {
		console.error(`${this.prefix} ${message}`, error ?? '', meta ?? '');
	}
}

