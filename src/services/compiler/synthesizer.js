import { callLLM } from '../api';
import { systemLog } from '../logger';

export async function generateProfessionalReport(rawData, sources) {
  systemLog.info("PART 5: Enhanced Report Synthesis Initialized");

  if (!rawData || rawData.length === 0) {
    return { markdown: "No research data found.", sources: [] };
  }

  // Derive structure from the database
  const entities = [...new Set(rawData.map(d => d.entity))];
  // Exclude the generic authority overview entries from sub-question count
  const subQuestions = [...new Set(rawData.filter(d => d.question !== 'Authority Overview').map(d => d.question))];

  // Dynamic minimum: whichever rule produces the largest number wins
  const minFromSubQuestions = subQuestions.length * 200;
  const minFromEntities = entities.length * 500;
  const minimumWords = Math.max(1000, minFromSubQuestions, minFromEntities);

  systemLog.info("📊 SYNTHESIS INPUT", {
    entities: entities.length,
    subQuestions: subQuestions.length,
    sources: sources?.length || 0,
    minimumWords,
    authoritySources: (sources || []).filter(s => s.isAuthority).length
  });

  // Number every source sequentially — no A/G split, just [1]…[N]
  const numberedSources = (sources || []).map((s, i) => ({
    ...s,
    ref: i + 1,
    label: `[${i + 1}] ${s.title || 'Untitled'} — ${s.url}${s.isAuthority ? ' (Authority)' : ''}`
  }));

  const sourceList = numberedSources.map(s => s.label).join('\n');

  // Build per-entity section scaffold with sub-questions listed
  const entitySections = entities.map(name => {
    const sqs = rawData.filter(d => d.entity === name && d.question !== 'Authority Overview').map(d => d.question);
    const sqList = [...new Set(sqs)].map(q => `  - ${q}`).join('\n');
    return `## ${name} (minimum 500 words)\n${sqList ? `Sub-questions covered:\n${sqList}` : ''}
### Key Findings
### Strategies & Approaches
### Quantitative Data & Metrics
### Challenges & Gaps`;
  }).join('\n\n');

  const entityRequirements = entities.map((name, i) =>
    `${i + 1}. ${name} — minimum 500 words, cite every relevant source`
  ).join('\n');

  const detailedPrompt = `You are writing a professional research report. Your job is to synthesize the research data below into a comprehensive, well-cited report.

SOURCES (${numberedSources.length} total — use the reference number [N] for all in-text citations):
${sourceList}

CITATION RULES:
- Every factual claim, finding, or piece of data MUST have an in-text citation immediately after it, e.g. "Companies are using AI for fraud detection [3][7]."
- Use the majority of the ${numberedSources.length} sources — only omit a source if it is genuinely irrelevant to any finding
- A source can be cited multiple times if relevant in multiple places
- The Full References section at the end must list every cited source as a numbered list matching the in-text numbers

ENTITIES TO COVER (you MUST cover every one in full):
${entityRequirements}

RESEARCH DATA:
${JSON.stringify(rawData, null, 2)}

WORD COUNT REQUIREMENTS:
- Minimum ${minimumWords} words total (calculated from: ${subQuestions.length} sub-questions × 200 = ${minFromSubQuestions} words; ${entities.length} entities × 500 = ${minFromEntities} words; floor of 1000)
- Minimum 200 words per sub-question addressed
- Minimum 500 words per entity section
- Do NOT pad with filler — if you reach the minimum, keep going with substance

REQUIRED STRUCTURE:
# [Report Title]
## Executive Summary
Synthesise the key findings across all ${entities.length} entities. Include cross-entity comparisons and the most significant cited evidence. (~250 words minimum)

${entitySections}

## Comparative Analysis
A GFM table comparing all entities across the key metrics found in the data. Every cell must contain real data or "Not found".
| Entity | [Metric A] | [Metric B] | [Metric C] | Key Sources |
|--------|------------|------------|------------|-------------|
${entities.map(e => `| ${e} | | | | |`).join('\n')}

## Data Gaps & Limitations
What was missing, unclear, or could not be verified from the sources.

## References
A numbered list of every source cited in this report:
1. [title] — [url]
2. ...

Return ONLY the Markdown report. No preamble, no commentary.`;

  try {
    const markdownReport = await callLLM(
      detailedPrompt,
      `Write a ${minimumWords}+ word research report covering all ${entities.length} entities equally: ${entities.join(', ')}. Cite the majority of the ${numberedSources.length} available sources using numbered in-text citations [N].`,
      false
    );
    systemLog.info(`✅ Report synthesized — ${minimumWords} word minimum, ${numberedSources.length} sources available`);
    return { markdown: markdownReport, sources };
  } catch (error) {
    systemLog.error("❌ Report synthesis failed", error);
    return { markdown: "Failed to generate professional report.", sources };
  }
}
