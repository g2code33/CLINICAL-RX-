import type { Bundle, ClinicalDay } from '../types';

async function makePdf(title: string, subtitle: string, sections: Array<{ heading: string; lines: string[] }>): Promise<string> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 50;
  const maxW = pageW - margin * 2;
  let y = 60;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(35, 112, 76);
  doc.text(title, margin, y);
  y += 22;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(subtitle, margin, y);
  y += 24;

  const line = (text: string) => {
    const wrapped = doc.splitTextToSize(text, maxW);
    for (const w of wrapped) {
      if (y > doc.internal.pageSize.getHeight() - 60) {
        doc.addPage();
        y = 60;
      }
      doc.text(w, margin, y);
      y += 14;
    }
  };

  for (const section of sections) {
    doc.setFontSize(12);
    doc.setTextColor(20, 20, 20);
    doc.setFont('helvetica', 'bold');
    doc.text(section.heading, margin, y);
    y += 16;
    doc.setFont('helvetica', 'normal');
    if (section.lines.length) section.lines.forEach((l) => line('• ' + l));
    else line('None.');
    y += 8;
  }

  return doc.output('dataurlstring');
}

export async function bundleToPdf(b: Bundle): Promise<string> {
  const stats = Object.entries(b.stats).map(([k, v]) => `${k}: ${v}`);
  return makePdf(b.title, `Type: ${b.type}   ·   Period: ${b.periodStart} → ${b.periodEnd}   ·   Created: ${new Date(b.createdAt).toLocaleString()}`, [
    { heading: 'Summary', lines: b.summary ? b.summary.split('\n') : ['No summary.'] },
    { heading: 'Statistics', lines: stats },
    { heading: 'Knowledge gaps', lines: b.knowledgeGaps },
    { heading: 'Recommended revision', lines: b.recommendedRevision },
    { heading: 'Highlights', lines: b.highlights },
  ]);
}

export async function dayToPdf(d: ClinicalDay): Promise<string> {
  const sections = [
    { heading: 'Conditions', lines: d.conditions },
    { heading: 'Medicines', lines: d.medicines },
    { heading: 'Investigations', lines: d.investigations },
    { heading: 'Observations', lines: d.observations },
    { heading: 'What I learned', lines: d.lessons },
    { heading: 'Uncertainties', lines: d.uncertainties },
    { heading: 'Topics to research', lines: d.topicsToResearch },
  ];
  return makePdf(`Clinical Day ${d.dayNumber} — ${d.site}`, `Date: ${d.date}`, sections);
}

export function dayToMarkdown(d: ClinicalDay): string {
  const lines: string[] = [];
  lines.push(`# Clinical Day ${d.dayNumber} — ${d.site}`);
  lines.push('');
  lines.push(`**Date:** ${d.date}`);
  lines.push('');
  const sections: Array<[string, string[]]> = [
    ['Conditions', d.conditions],
    ['Medicines', d.medicines],
    ['Investigations', d.investigations],
    ['Observations', d.observations],
    ['What I learned', d.lessons],
    ['Uncertainties', d.uncertainties],
    ['Topics to research', d.topicsToResearch],
  ];
  for (const [title, items] of sections) {
    lines.push(`## ${title}`);
    lines.push('');
    if (items.length) items.forEach((it) => lines.push(`- ${it}`));
    else lines.push('_None._');
    lines.push('');
  }
  return lines.join('\n');
}

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
