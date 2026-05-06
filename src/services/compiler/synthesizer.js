import { callLLM } from '../api';
import { systemLog } from '../logger';

/**
 * PART 5: Enhanced Professional Report Synthesis
 */
export async function generateProfessionalReport(rawData, sources) {
  systemLog.info("PART 5: Enhanced Report Synthesis Initialized");
  
  if (!rawData || rawData.length === 0) {
    return { markdown: "No research data found.", sources: [] };
  }

  // ENHANCED LOGGING: SYNTHESIS INPUT
  const entityCounts = rawData.reduce((acc, entry) => {
    acc[entry.entity] = (acc[entry.entity] || 0) + 1;
    return acc;
  }, {});

  systemLog.info("📊 SYNTHESIS INPUT", {
    totalSources: sources?.length || 0,
    entitiesCovered: Object.keys(entityCounts).length,
    sourceBreakdown: entityCounts,
    authoritySources: (sources || []).filter(s => s.isAuthority || s.url?.includes('.gov') || s.url?.includes('.edu')).length
  });

  const authoritySources = sources.filter(s => s.isAuthority);
  const generalSources = sources.filter(s => !s.isAuthority);
  const knowledgeSummary = JSON.stringify(rawData, null, 2);

  const detailedPrompt = `Generate a COMPREHENSIVE executive report from this research data. 
PRIORITIZE AUTHORITY SOURCES (gov/uni PDFs):
AUTHORITY (Double weight): ${authoritySources.map((s, i) => `[A${i + 1}] ${s.title} (${s.url})`).join('\n')}
GENERAL SOURCES: ${generalSources.map((s, i) => `[G${i + 1}] ${s.title} (${s.url})`).join('\n')}

DATA TO SYNTHESIZE:
${knowledgeSummary}

REQUIREMENTS:
1. MINIMUM 1000 words - detailed, professional analysis.
2. Use authority sources first to establish the baseline of truth.
3. USE ALL identified sources with inline citations [A1], [G1], etc.
4. Include QUANTITATIVE METRICS prominently (%, ROI, $ amounts).
5. Professional GFM tables for data comparisons.
6. Clear "Data Gaps" section identifying missing information.

STRUCTURE:
# [Title]
## Executive Summary (approx 250 words)
Synthesize core findings and high-level insights [citations].
## [Entity 1] Deep Dive
### Adoption & Strategic Trends (Primary Authority Findings)
### Key Tools & Technologies Involved
### Quantitative Impact & Performance Data
### Implementation Challenges
## Comparison Analysis
| Entity | Key Metric 1 | Key Metric 2 | Primary Sources |
## Data Gaps & Future Research Needs
## Full Source Index

Return ONLY the Markdown report.`;

  try {
    const markdownReport = await callLLM(detailedPrompt, "Synthesize a professional 1000+ word executive report prioritizing authority sources.", false);
    systemLog.info("✅ Enhanced 1000+ word report synthesized with authority priority");
    return { markdown: markdownReport, sources: sources };
  } catch (error) {
    systemLog.error("❌ Report synthesis failed", error);
    return { markdown: "Failed to generate professional report.", sources: sources };
  }
}