const PREFIX = '[Draht]';

function make(scope?: string) {
  const tag = scope ? `${PREFIX} ${scope}:` : PREFIX;

  return {
    /* eslint-disable no-console */
    info: (...args: unknown[]) => console.log(tag, ...args),
    warn: (...args: unknown[]) => console.warn(tag, ...args),
    error: (...args: unknown[]) => console.error(tag, ...args),
    /* eslint-enable no-console */
    scoped: (child: string) => make(scope ? `${scope}/${child}` : child),
  };
}

export type ModLogger = ReturnType<typeof make>;

export const modLogger = make();
