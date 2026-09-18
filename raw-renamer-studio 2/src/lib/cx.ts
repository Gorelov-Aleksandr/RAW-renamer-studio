export const cx = (...a: Array<string | false | null | undefined>): string =>
  a.filter(Boolean).join(' ');
