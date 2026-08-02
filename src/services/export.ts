import type { Bundle } from '../types';

export function bundleToMarkdown(b: Bundle): string {
  const lines: string[] = [];
  lines.push(`# ${b.title}`);
  lines.push('');
  lines.push(`**Type:** ${b.type}  `);
  lines.push(`**Period:** ${b.periodStart} → ${b.periodEnd}  `);
  if (b.aiModel) lines.push(`**AI model:** ${b.aiModel}`);
  lines.push(`**Created:** ${new Date(b.createdAt).toLocaleString()}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(b.summary || '_No summary._');
  lines.push('');
  lines.push('## Statistics');
  lines.push('');
  const stats = Object.entries(b.stats);
  if (stats.length) {
    lines.push('| Metric | Value |');
    lines.push('| --- | --- |');
    for (const [k, v] of stats) lines.push(`| ${k} | ${v} |`);
  } else {
    lines.push('_None._');
  }
  lines.push('');
  lines.push('## Knowledge gaps');
  lines.push('');
  if (b.knowledgeGaps.length) b.knowledgeGaps.forEach((g) => lines.push(`- ${g}`));
  else lines.push('_None identified._');
  lines.push('');
  lines.push('## Recommended revision');
  lines.push('');
  if (b.recommendedRevision.length) b.recommendedRevision.forEach((r) => lines.push(`- ${r}`));
  else lines.push('_None._');
  lines.push('');
  lines.push('## Highlights');
  lines.push('');
  if (b.highlights.length) b.highlights.forEach((h) => lines.push(`- ${h}`));
  else lines.push('_None._');
  lines.push('');
  if (b.sourceBundleIds.length) {
    lines.push('## Merged from');
    lines.push('');
    b.sourceBundleIds.forEach((id) => lines.push(`- ${id}`));
  }
  return lines.join('\n');
}

export function bundleToJson(b: Bundle): string {
  return JSON.stringify(b, null, 2);
}

export function downloadText(filename: string, text: string, mime = 'text/markdown') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}
