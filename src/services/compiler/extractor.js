import { fetchWithDiffbot, callLLM } from '../api';
import { systemLog } from '../logger';

/**
 * Evaluates the research value of a source based on a 3-factor threshold.
 */
async function evaluateInformationGain(newContent, sourceCount) {
  const prompt = `EVALUATE NEW SOURCE FOR RESEARCH VALUE:

EXISTING KNOWLEDGE BASE: ${sourceCount} sources already found.
NEW CONTENT SNIPPET: ${newContent.slice(0, 3000)}...

TASK:
Score this source from 0-10 based on:
1. NOVELTY: Adds NEW examples, tools, or metrics not usually found in surface summaries.
2. AUTHORITY: Is this a high-authority source (gov.au, edu.au, official report) vs a generic blog?
3. COMPLETENESS: Does it provide detailed analysis vs surface-level mentions?

CRITERIA FOR HIGH SCORE (7-10):
- 3+ specific tools, technologies, or entities named.
- Quantitative results included (%, ROI, budget, time).
- Multiple perspectives or use cases covered.

Return ONLY a JSON object:
{
  "score": number,
  "reason": "short explanation",
  "is_redundant": boolean
}`;

  try {
    const result = await callLLM(prompt, "", true);
    const evaluation = JSON.parse(result);
    return {
      score: evaluation.score,
      reason: evaluation.reason,
      sufficient: evaluation.score >= 7,
      isRedundant: evaluation.is_redundant || evaluation.score < 3
    };
  } catch (error) {
    systemLog.warn("Evaluation failed, using fallback metrics", error.message);
    return { score: 5, reason: "Fallback", sufficient: false, isRedundant: false };
  }
}

/**
 * Part 3: The Extractor - Now with multi-factor validation
 */
export async function extractData(url, question, sourceCount) {
  try {
    systemLog.debug(`Fetching: ${url}`);
    const rawContent = await fetchWithDiffbot(url);
    const truncatedContent = rawContent.substring(0, 18000);

    // 1. Evaluate Gain First
    const evalResult = await evaluateInformationGain(truncatedContent, sourceCount);
    
    if (evalResult.isRedundant) {
      systemLog.debug(`Skipping ${url.substring(0, 30)}: Low utility (Score: ${evalResult.score})`);
      return { content: null, evaluation: evalResult };
    }

    // 2. Extract if valuable
    const extractPrompt = `EXTRACT RESEARCH DATA:
URL: ${url}
QUESTION: "${question}"
CONTENT:
${truncatedContent}

TASK:
Extract specific, authoritative answers. Include metrics, tool names, and primary facts. 
Format as a clean, dense summary.`;

    const extraction = await callLLM(extractPrompt, "", false);
    
    return {
      content: extraction.trim(),
      evaluation: evalResult
    };
  } catch (error) {
    systemLog.warn(`Extraction failed for ${url}`, error.message);
    return { content: null, evaluation: { score: 0, reason: "Error", sufficient: false } };
  }
}