import { callLLM } from '../api';
import { systemLog } from '../logger';

export async function generateProfessionalReport(rawData, sources) {
  systemLog.info("PART 5: Enhanced Report Synthesis Initialized");

  if (!rawData || rawData.length === 0) {
    return { markdown: "No research data found.", sources: [] };
  }

  const entityCounts = rawData.reduce((acc, entry) => {
    acc[entry.entity] = (acc[entry.entity] || 0) + 1;
    return acc;
  }, {});

  const entities = Object.keys(entityCounts);

  systemLog.info("📊 SYNTHESIS INPUT", {
    totalEntries: rawData.length,
    entitiesCovered: entities.length,
    entriesPerEntity: entityCounts,
    totalSources: sources?.length || 0,
    authoritySources: (sources || []).filter(s => s.isAuthority || s.url?.includes('.gov') || s.url?.includes('.edu')).length
  });

  const authoritySources = sources.filter(s => s.isAuthority);
  const generalSources = sources.filter(s => !s.isAuthority);

  // Build one section definition per entity so the LLM knows exactly what to produce
  const entitySections = entities.map(name => `## ${name} Deep Dive
### Key Findings (authority sources first)
### Tools & Strategies
### Quantitative Metrics (%, $, targets, timelines)
### Implementation Challenges`).join('\n\n');

  const entityRequirements = entities.map((name, i) =>
    `${i + 1}. ${name}: minimum 200 words, at least one inline citation, quantitative data required`
  ).join('\n');

  const detailedPrompt = `Generate a COMPREHENSIVE executive report from this research data.

ENTITIES TO COVER (you MUST cover every one with equal depth):
${entityRequirements}

AUTHORITY SOURCES (double weight — cite these first):
${authoritySources.map((s, i) => `[A${i + 1}] ${s.title} (${s.url})`).join('\n') || 'None'}

GENERAL SOURCES:
${generalSources.map((s, i) => `[G${i + 1}] ${s.title} (${s.url})`).join('\n') || 'None'}

RESEARCH DATA:
${JSON.stringify(rawData, null, 2)}

REQUIREMENTS:
- MINIMUM 1000 words total
- Every entity listed above MUST have its own Deep Dive section of at least 200 words
- Do NOT omit or abbreviate any entity's section — missing an entity is a critical failure
- Use inline citations [A1], [G1] etc. throughout
- Include quantitative metrics (%, $, targets, dates) wherever the data supports it
- Use GFM tables for side-by-side entity comparisons
- End with a Data Gaps section and a Full Source Index

REQUIRED STRUCTURE (do not deviate — use the exact entity names below):
# [Report Title]
## Executive Summary (approx 250 words — synthesise all ${entities.length} entities)
${entitySections}
## Comparison Analysis
| Entity | [Key Metric A] | [Key Metric B] | Primary Sources |
|--------|----------------|----------------|-----------------|
${entities.map(e => `| ${e} | | | |`).join('\n')}
## Data Gaps & Future Research Needs
## Full Source Index

Return ONLY the Markdown report.`;

  try {
    const markdownReport = await callLLM(
      detailedPrompt,
      `Synthesize a professional 1000+ word executive report. You MUST include a full Deep Dive section for each of these entities: ${entities.join(', ')}. Missing any entity is unacceptable.`,
      false
    );
    systemLog.info(`✅ Report synthesized — entities covered: ${entities.join(', ')}`);
    return { markdown: markdownReport, sources };
  } catch (error) {
    systemLog.error("❌ Report synthesis failed", error);
    return { markdown: "Failed to generate professional report.", sources };
  }
}
