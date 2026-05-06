import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { translateQuery } from '../services/compiler/translator';
import { executePlan } from '../services/compiler/executor';
import { generateProfessionalReport } from '../services/compiler/synthesizer';
import { exportToPdf } from '../services/pdfService';
import { systemLog } from '../services/logger';
import { PersistenceService } from '../services/persistence';
import SafeIcon from '../common/SafeIcon';

const MarkdownComponents = {
  h1: ({ children }) => (
    <h1 className="text-3xl font-black text-white mb-8 border-b-2 border-blue-600 pb-4 tracking-tighter uppercase">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xl font-bold text-white mt-12 mb-6 flex items-center gap-3 border-l-4 border-blue-600 pl-4 uppercase tracking-tight">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-bold text-blue-400 mt-8 mb-4 uppercase tracking-wide">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="text-neutral-300 leading-relaxed mb-6 text-sm md:text-base">
      {children}
    </p>
  ),
  table: ({ children }) => (
    <div className="my-8 overflow-x-auto rounded-lg border border-neutral-800">
      <table className="w-full text-sm text-left border-collapse bg-black/20">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-neutral-900 text-white font-bold">{children}</thead>,
  th: ({ children }) => <th className="p-4 border-b border-neutral-800">{children}</th>,
  td: ({ children }) => <td className="p-4 border-b border-neutral-800 text-neutral-400">{children}</td>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-400 underline underline-offset-4 font-medium">
      {children}
    </a>
  ),
  code({ node, inline, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '');
    return !inline && match ? (
      <div className="my-6 rounded-lg overflow-hidden border border-neutral-800 shadow-2xl">
        <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div" customStyle={{ margin: 0, padding: '1.5rem', fontSize: '13px' }} {...props} >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      </div>
    ) : (
      <code className="bg-neutral-800 text-blue-300 px-1.5 py-0.5 rounded font-mono text-sm" {...props}>
        {children}
      </code>
    );
  }
};

export default function CompilerUI() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('idle');
  const [progressMsg, setProgressMsg] = useState('');
  const [report, setReport] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [expandedLog, setExpandedLog] = useState(null);

  useEffect(() => {
    const unsubscribe = systemLog.subscribe(setLogs);
    return () => unsubscribe();
  }, []);

  const handleCompile = async () => {
    if (!query.trim()) return;
    setStatus('translating');
    setProgressMsg('Step 1: Matrix Decomposition...');
    setReport('');
    systemLog.clear();
    PersistenceService.clear();
    try {
      const plan = await translateQuery(query);
      setStatus('executing');
      const { database, sources } = await executePlan(plan, (msg) => {
        setProgressMsg(msg);
      });
      setStatus('synthesizing');
      setProgressMsg('Step 3: Professional 1000-Word Synthesis...');
      const finalReport = await generateProfessionalReport(database, sources);
      setReport(finalReport.markdown);
      setStatus('complete');
      setProgressMsg('');
    } catch (err) {
      setStatus('error');
      systemLog.error('Pipeline Halt', err.message);
      setProgressMsg('Process interrupted: ' + err.message);
    }
  };

  const handleDownloadPdf = async () => {
    if (!report) return;
    setIsExporting(true);
    try {
      await exportToPdf(report, `Research_Report_${new Date().getTime()}.pdf`);
      systemLog.info("PDF Report exported successfully");
    } catch (err) {
      systemLog.error("Export Failed", err.message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-neutral-300 font-mono p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="border-b border-neutral-800 pb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600/20 rounded border border-blue-600/40">
                <SafeIcon name="Terminal" className="text-blue-500 w-6 h-6" />
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight uppercase"> Research Compiler <span className="text-blue-600">v2.1</span> </h1>
            </div>
            <p className="text-neutral-500 text-[10px] mt-2 uppercase tracking-[0.3em]"> Autonomous Matrix Execution • Professional Synthesis • PDF Export </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowLogs(!showLogs)} className="text-[10px] font-bold text-neutral-500 border border-neutral-800 px-4 py-2 rounded hover:bg-neutral-900 transition-all uppercase tracking-widest" >
              {showLogs ? 'Close Console' : 'Open Console'}
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className={`${showLogs ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-6`}>
            <section className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black text-neutral-600 uppercase tracking-widest">Compiler Input</span>
                {['translating', 'executing', 'synthesizing'].includes(status) && (
                  <span className="flex items-center gap-2 text-[10px] font-bold text-blue-500 animate-pulse">
                    <SafeIcon name="Activity" className="w-3 h-3" /> PIPELINE_ACTIVE
                  </span>
                )}
              </div>
              <textarea className="w-full bg-black/40 border border-neutral-800 rounded-lg p-5 text-sm md:text-base focus:outline-none focus:border-blue-700 transition-all resize-y min-h-[140px] text-neutral-200 placeholder:text-neutral-700 leading-relaxed" placeholder="Enter research objective (e.g.,'Compare the water sustainability policies of Rio Tinto and BHP Group from 2023')" value={query} onChange={(e) => setQuery(e.target.value)} disabled={['translating', 'executing', 'synthesizing'].includes(status)} />
              <div className="mt-6 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="text-[10px] text-neutral-600 font-bold uppercase tracking-tighter">
                  {status === 'complete' ? 'Process Finalized' : `Status: ${status}`}
                </div>
                <button onClick={handleCompile} disabled={['translating', 'executing', 'synthesizing'].includes(status) || !query.trim()} className="w-full md:w-auto bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-600 text-white px-10 py-3 rounded-lg text-xs font-black transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-3 uppercase tracking-tighter" >
                  {['translating', 'executing', 'synthesizing'].includes(status) ? (
                    <SafeIcon name="RefreshCcw" className="w-4 h-4 animate-spin" />
                  ) : (
                    <SafeIcon name="Play" className="w-4 h-4" />
                  )} Compile Research
                </button>
              </div>
            </section>

            {['translating', 'executing', 'synthesizing'].includes(status) && (
              <div className="bg-blue-600/5 border border-blue-600/20 rounded-xl p-5 flex items-center gap-5">
                <div className="w-10 h-10 rounded-full border-2 border-blue-600/30 border-t-blue-600 animate-spin flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em]">{status}</h3>
                  <p className="text-sm text-neutral-400 mt-1 font-medium truncate">{progressMsg}</p>
                </div>
              </div>
            )}

            {report && (
              <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="bg-neutral-800/30 px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <SafeIcon name="FileText" className="w-4 h-4 text-blue-500" />
                    <h2 className="text-[10px] font-black text-neutral-300 uppercase tracking-[0.2em]">Synthesis_Output.md</h2>
                  </div>
                  <div className="flex gap-4">
                    <button onClick={handleDownloadPdf} disabled={isExporting} className="text-[10px] text-blue-400 hover:text-blue-300 uppercase font-bold flex items-center gap-2 disabled:text-neutral-600" >
                      {isExporting ? (
                        <SafeIcon name="RefreshCcw" className="w-3 h-3 animate-spin" />
                      ) : (
                        <SafeIcon name="Download" className="w-3 h-3" />
                      )} Export PDF
                    </button>
                    <button onClick={() => navigator.clipboard.writeText(report)} className="text-[10px] text-neutral-500 hover:text-white uppercase font-bold" >
                      Copy Markdown
                    </button>
                  </div>
                </div>
                <div className="p-8 max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents} >
                    {report}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>

          {showLogs && (
            <div className="lg:col-span-4 bg-black border border-neutral-800 rounded-xl flex flex-col h-[500px] lg:h-[calc(100vh-160px)] sticky top-8 shadow-2xl overflow-hidden text-neutral-500">
              <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/20">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${status === 'idle' ? 'bg-neutral-600' : 'bg-green-500 animate-pulse'}`} />
                  <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">System Log</span>
                </div>
                <span className="text-[10px] text-neutral-600 uppercase font-bold">{logs.length} entries</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-[9px] scrollbar-hide">
                {logs.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-neutral-800 italic uppercase">
                    Awaiting System Activity...
                  </div>
                ) : (
                  logs.map((log, idx) => (
                    <div key={idx} className="border-l border-neutral-800 pl-3 py-1 cursor-pointer hover:bg-neutral-900/40 transition-colors" onClick={() => setExpandedLog(expandedLog === idx ? null : idx)}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`font-black ${log.level === 'ERROR' ? 'text-red-500' : log.level === 'WARN' ? 'text-yellow-500' : log.level === 'INFO' ? 'text-blue-500' : 'text-neutral-600'}`}>{log.level}</span>
                        <span className="text-neutral-700 tabular-nums">{log.timestamp.split('T')[1].slice(0, 8)}</span>
                        {log.data && (
                          <span className="text-[8px] bg-neutral-800 px-1 rounded text-neutral-500">{expandedLog === idx ? 'Collapse' : 'Expand'}</span>
                        )}
                      </div>
                      <div className="text-neutral-400 leading-relaxed">{log.message}</div>
                      {expandedLog === idx && log.data && (
                        <pre className="mt-2 p-2 bg-black border border-neutral-800 rounded text-blue-400 overflow-x-auto whitespace-pre-wrap">
                          {log.data}
                        </pre>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}