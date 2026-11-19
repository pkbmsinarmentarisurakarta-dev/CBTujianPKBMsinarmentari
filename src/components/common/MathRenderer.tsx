import katex from 'katex';
import 'katex/contrib/mhchem';
import { ImageOff } from 'lucide-react';
import React, { useMemo, useState } from 'react';

function renderLatexSegments(input: string): string {
  if (!input) return '';
  // Render $$...$$ display math first
  let out = input.replace(/\$\$([\s\S]+?)\$\$/g, (_m, expr) => {
    try {
      return katex.renderToString(expr.trim(), { displayMode: true, throwOnError: false });
    } catch {
      return `<code>${expr}</code>`;
    }
  });
  // Render $...$ inline math
  out = out.replace(/\$([^$\n]+?)\$/g, (_m, expr) => {
    try {
      return katex.renderToString(expr.trim(), { displayMode: false, throwOnError: false });
    } catch {
      return `<code>${expr}</code>`;
    }
  });
  return out;
}

export function LatexBlock({ formula }: { formula: string }) {
  const html = useMemo(() => {
    if (!formula) return '';
    try {
      return katex.renderToString(formula, { displayMode: true, throwOnError: false });
    } catch {
      return formula;
    }
  }, [formula]);

  if (!formula) return null;
  return (
    <div
      className="my-2 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3 text-slate-900"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function ResilientImage({
  src,
  alt,
  width = '100%',
  className = '',
}: {
  src?: string;
  alt: string;
  width?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src) return null;

  if (failed) {
    return (
      <div className="my-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-xs text-slate-500">
        <ImageOff className="h-5 w-5 text-slate-400 shrink-0" />
        <span>Gambar soal tidak dapat dimuat ({alt})</span>
      </div>
    );
  }

  return (
    <div className="my-3">
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        style={{ maxWidth: width || '100%' }}
        className={`rounded-lg border border-slate-200 bg-white object-contain ${className}`}
      />
    </div>
  );
}

export function QuestionTable({ tableJson }: { tableJson?: string }) {
  const parsed = useMemo(() => {
    if (!tableJson) return null;
    try {
      const data = JSON.parse(tableJson) as { headers?: string[]; rows?: string[][] };
      if (!data.headers?.length && !data.rows?.length) return null;
      return data;
    } catch {
      return null;
    }
  }, [tableJson]);

  if (!parsed) return null;

  return (
    <div className="my-3 overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full border-collapse text-sm">
        {parsed.headers && parsed.headers.length > 0 && (
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              {parsed.headers.map((h, i) => (
                <th key={i} className="border-b border-r border-slate-200 px-3 py-2 text-left font-semibold last:border-r-0">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-slate-200 bg-white">
          {(parsed.rows || []).map((row, rIdx) => (
            <tr key={rIdx}>
              {row.map((cell, cIdx) => (
                <td key={cIdx} className="border-r border-slate-200 px-3 py-2 tabular-nums text-slate-700 last:border-r-0">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RichMathContent({
  html,
  latexFormula,
  imageUrl,
  imageWidth,
  tableJson,
}: {
  html: string;
  latexFormula?: string;
  imageUrl?: string;
  imageWidth?: string;
  tableJson?: string;
}) {
  const renderedHtml = useMemo(() => renderLatexSegments(html || ''), [html]);

  return (
    <div className="space-y-2 text-slate-800 leading-relaxed">
      <div className="question-prose text-[15px]" dangerouslySetInnerHTML={{ __html: renderedHtml }} />
      {latexFormula ? <LatexBlock formula={latexFormula} /> : null}
      {imageUrl ? <ResilientImage src={imageUrl} alt="Ilustrasi soal ujian" width={imageWidth} /> : null}
      {tableJson ? <QuestionTable tableJson={tableJson} /> : null}
    </div>
  );
}

export function InlineMathText({ html }: { html: string }) {
  const rendered = useMemo(() => renderLatexSegments(html || ''), [html]);
  return <span className="question-prose" dangerouslySetInnerHTML={{ __html: rendered }} />;
}
