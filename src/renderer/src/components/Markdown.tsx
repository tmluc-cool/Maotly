import type { ReactNode } from 'react';

/** Inline formatting: **bold** and [links](https://…). Links open in the browser via the main process. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https:\/\/[^)\s]+\))/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{inline(part.slice(2, -2))}</strong>;
    const link = part.match(/^\[([^\]]+)\]\((https:\/\/[^)\s]+)\)$/);
    if (link) {
      return (
        <button key={i} type="button" className="text-brand-700 underline dark:text-brand-300" onClick={() => void window.api.openExternal(link[2])}>
          {link[1]}
        </button>
      );
    }
    return part;
  });
}

/** Very small Markdown renderer for our own documents (headings, lists, tables, paragraphs). */
export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const cls = level === 1 ? 'text-3xl font-extrabold' : level === 2 ? 'mt-6 text-xl font-bold' : 'mt-4 font-bold';
      const Tag = (`h${level}` as 'h1' | 'h2' | 'h3');
      blocks.push(<Tag key={i} className={cls}>{inline(h[2])}</Tag>);
      i++;
      continue;
    }
    if (/^\s*-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        let item = lines[i++].replace(/^\s*-\s+/, '');
        // Indented lines continue the item (wrapped long bullets).
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*-\s+/.test(lines[i])) item += ` ${lines[i++].trim()}`;
        items.push(item);
      }
      blocks.push(
        <ul key={i} className="list-disc space-y-1 pl-6">
          {items.map((t, k) => (
            <li key={k}>{inline(t)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        const cells = lines[i].split('|').slice(1, -1).map((c) => c.trim());
        if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <table key={i} className="w-full text-left text-sm">
          <thead>
            <tr>{head.map((c, k) => <th key={k} className="border-b border-slate-300 py-1 pr-4 dark:border-slate-700">{inline(c)}</th>)}</tr>
          </thead>
          <tbody>
            {body.map((r, k) => (
              <tr key={k}>{r.map((c, m) => <td key={m} className="border-b border-slate-200 py-1 pr-4 align-top dark:border-slate-800">{inline(c)}</td>)}</tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#|\s*-\s|\|)/.test(lines[i])) para.push(lines[i++]);
    blocks.push(
      <p key={i}>
        {para.map((p, k) => (
          <span key={k}>
            {inline(p)}
            {k < para.length - 1 && <br />}
          </span>
        ))}
      </p>,
    );
  }
  return <div className="space-y-3 leading-relaxed">{blocks}</div>;
}
