import agentsMd from '../../../AGENTS.md';
import readmeMd from '../../../README.md';
import extendingMd from '../../EXTENDING.md';

// Split repository docs into heading-level sections once per isolate.
function sections(markdown, source) {
  const out = [];
  let current = { title: source, body: [] };
  for (const line of String(markdown).split('\n')) {
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    if (heading) {
      if (current.body.length) out.push(current);
      current = { title: `${source} › ${heading[1].trim()}`, body: [] };
    } else {
      current.body.push(line);
    }
  }
  if (current.body.length) out.push(current);
  return out.map(s => ({ title: s.title, text: s.body.join('\n').trim() })).filter(s => s.text);
}

const DOCS = [...sections(extendingMd, 'Extending VibeMol'), ...sections(readmeMd, 'README'), ...sections(agentsMd, 'AGENTS')];

/** Return the doc sections most relevant to a free-text topic. */
export function helpSearch(topic) {
  // The extension guide is short and always wanted whole before writing code.
  if (/extend|extension|new feature|add(ing)? (a )?feature|plugin/i.test(String(topic || ''))) return String(extendingMd).slice(0, 12000);
  const terms = String(topic || '').toLowerCase().split(/[^a-z0-9.]+/).filter(t => t.length > 2);
  if (!terms.length) return `Available help sections:\n${DOCS.map(d => `- ${d.title}`).join('\n')}`;
  const scored = DOCS.map(doc => {
    const hay = `${doc.title}\n${doc.text}`.toLowerCase();
    const score = terms.reduce((sum, t) => sum + (hay.split(t).length - 1) + (doc.title.toLowerCase().includes(t) ? 5 : 0), 0);
    return { doc, score };
  }).filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
  if (!scored.length) return `No help section matched "${topic}". Sections:\n${DOCS.map(d => `- ${d.title}`).join('\n')}`;
  return scored.map(({ doc }) => `## ${doc.title}\n${doc.text.slice(0, 4000)}`).join('\n\n');
}
