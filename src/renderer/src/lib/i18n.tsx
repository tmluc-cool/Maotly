import { Fragment, type ReactNode } from 'react';
import { t, type MessageKey } from '@shared/i18n';

export { formatDecimal, formatNumber, getLang, locale, t, tn, tx } from '@shared/i18n';

/** Message with React elements for {placeholders}, e.g. rich('home.title', { em: <span>…</span> }). */
export function rich(key: MessageKey, parts: Record<string, ReactNode>): ReactNode {
  return t(key)
    .split(/(\{\w+\})/)
    .map((piece, i) => {
      const name = /^\{(\w+)\}$/.exec(piece)?.[1];
      return <Fragment key={i}>{name && name in parts ? parts[name] : piece}</Fragment>;
    });
}
