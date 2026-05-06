import { searchTavily } from '../api';
import { extractData } from './extractor';
import { systemLog } from '../logger';
import { PersistenceService } from '../persistence';

const MATRIX_AXES = {
  DOMAINS: ['site:.gov.au', 'site:.edu.au', 'site:.org'],
  FILETYPES: ['filetype:pdf', 'filetype:docx', 'filetype:xlsx'],
  INFO_TYPES: ['policy', 'report', 'review', 'guideline', 'evaluation', 'submission']
};

const TIER_NAMES = {
  0: 'Authority First',
  1: 'Official Data',
  2: 'Domain Matrix',
  3: 'Filetype Deep-dive',
  4: 'Contextual Policy'
};

const MIN_AUTHORITY_HITS = 3;
const MIN_SOURCES_PER_ENTITY = 6;

const AUTHORITY_QUERY_TEMPLATES = [
  (coreTask, entity) => `"${entity}" ${coreTask} filetype:pdf site:.gov.au`,
  (coreTask, entity) => `"${entity}" ${coreTask} filetype:pdf site:.edu.au`,
  (coreTask, entity) => `"${entity}" ${coreTask} AND report site:.gov.au`,
  (coreTask, entity) => `"${entity}" ${coreTask} AND guide site:.gov.au`,
  (coreTask, entity) => `"${entity}" ${coreTask} filetype:pdf AND policy site:.gov.au`,
  (coreTask, entity) => `"${entity}" ${coreTask} AND evaluation site:.gov.au`
];

function generateQueries(tier, entity, coreTask, question) {
  const queries = [];
  const subjects = [entity.name, ...(entity.synonyms || [])];

  subjects.forEach(subject => {
    const base = `"${subject}" ${coreTask} ${question}`;
    if (tier === 1) {
      queries.push(`${base} AND ("official" OR "data")`);
    } else if (tier === 2) {
      MATRIX_AXES.DOMAINS.forEach(domain => queries.push(`${base} ${domain}`));
    } else if (tier === 3) {
      MATRIX_AXES.FILETYPES.forEach(ft => queries.push(`${base} ${ft}`));
    } else if (tier === 4) {
      MATRIX_AXES.DOMAINS.forEach(dom => {
        MATRIX_AXES.INFO_TYPES.slice(0, 2).forEach(it => queries.push(`${base} ${dom} ${it}`));
      });
    }
  });
  return [...new Set(queries)];
}

export async function executePlan(plan, onProgress) {
  systemLog.info("PART 2: Authority-First Matrix Executor");
  const localDatabase = [];
  const uniqueSources = new Map();

  for (const entity of plan.entities) {
    systemLog.info(`Processing entity: ${entity.name}`);

    let entitySourcesCount = 0;
    let authorityHits = 0;

    systemLog.info(`🏛️ TIER 0: Authority-First for ${entity.name}`);
    onProgress(`Tier 0 (Authority): ${entity.name}`);

    for (const template of AUTHORITY_QUERY_TEMPLATES) {
      const query = template(plan.core_task, entity.name);
      
      systemLog.info(`  [Tier 0 – ${TIER_NAMES[0]}] Search: ${query}`);

      try {
        const results = await searchTavily(query);
        
        systemLog.info("📄 SEARCH RESULTS", {
          hits: results.length,
          top3: results.slice(0, 3).map(r => ({
            title: (r.title || 'No title').slice(0, 60) + '...',
            url: r.url,
            authority: r.url?.includes('.gov') || r.url?.includes('.edu') ? 'YES' : 'NO'
          })),
          fetching: results.slice(0, 2).map(r => r.url)
        });

        for (const result of results.slice(0, 2)) {
          if (uniqueSources.has(result.url)) continue;
          const { content, evaluation } = await extractData(result.url, "General authority overview", entitySourcesCount);
          
          if (content && (evaluation.sufficient || evaluation.score >= 6)) {
            authorityHits++;
            entitySourcesCount++;
            uniqueSources.set(result.url, { title: result.title, url: result.url, isAuthority: true });
            localDatabase.push({
              entity: entity.name,
              question: "Authority Overview",
              answer: content,
              isAuthority: true,
              timestamp: new Date().toISOString()
            });
            systemLog.info(`✅ Authority hit [${authorityHits}/12]: ${result.title}`);
          }
        }
      } catch (e) {
        systemLog.error(`Tier 0 error`, e);
      }
    }

    if (authorityHits < MIN_AUTHORITY_HITS) {
      systemLog.info("🧠 Low authority coverage → Activating Tiers 1-4");
      for (const sqGroup of plan.sub_questions) {
        if (sqGroup.entity !== entity.name) continue;

        for (const question of sqGroup.questions) {
          let accumulatedKnowledge = "";
          let questionSourcesCount = 0;

          for (let tier = 1; tier <= 4; tier++) {
            if (entitySourcesCount >= MIN_SOURCES_PER_ENTITY && tier > 2) break;
            onProgress(`T${tier} Search: ${entity.name} (${entitySourcesCount} sources)`);
            
            const queries = generateQueries(tier, entity, plan.core_task, question);
            for (const query of queries) {
              if (questionSourcesCount >= 3) break;

              systemLog.info(`  [Tier ${tier} – ${TIER_NAMES[tier] || 'Custom'}] Search: ${query}`);

              try {
                const results = await searchTavily(query);

                systemLog.info("📄 SEARCH RESULTS", {
                  hits: results.length,
                  top3: results.slice(0, 3).map(r => ({
                    title: (r.title || 'No title').slice(0, 60) + '...',
                    url: r.url,
                    authority: r.url?.includes('.gov') || r.url?.includes('.edu') ? 'YES' : 'NO'
                  })),
                  fetching: results.slice(0, 2).map(r => r.url)
                });

                for (const result of results.slice(0, 2)) {
                  if (uniqueSources.has(result.url)) continue;
                  const { content } = await extractData(result.url, question, entitySourcesCount);
                  if (content) {
                    accumulatedKnowledge += `\n\n${content}`;
                    uniqueSources.set(result.url, { title: result.title, url: result.url, isAuthority: false });
                    entitySourcesCount++;
                    questionSourcesCount++;
                  }
                }
              } catch (e) {
                systemLog.error(`Tier ${tier} error`, e);
              }
            }
          }
          if (accumulatedKnowledge) {
            localDatabase.push({
              entity: entity.name,
              question: question,
              answer: accumulatedKnowledge,
              isAuthority: false,
              timestamp: new Date().toISOString()
            });
          }
        }
      }
    } else {
      systemLog.info(`✅ Sufficient authority coverage - skipping Tier 1-4 for ${entity.name}`);
    }
    PersistenceService.save(localDatabase);
  }

  return { database: localDatabase, sources: Array.from(uniqueSources.values()) };
}