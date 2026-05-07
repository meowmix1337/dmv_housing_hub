import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';
const level = process.env.LOG_LEVEL ?? 'info';

export const log = pino({
  level,
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});

export type Logger = typeof log;
