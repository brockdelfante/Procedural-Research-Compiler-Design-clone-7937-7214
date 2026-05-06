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
import { HistoryService } from '../services/history';
import SafeIcon from '../common/SafeIcon';

// ---------------------------------------------------------------------------
// Markdown renderer config
// ---------------------------------------------------------------------------
const MD = {
  h1: ({ children }) => (
    <h1 className="text-2xl font-bold text-white mb-6 pb-3 border-b border-slate-700">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-semibold text-white mt-10 mb-4 flex items-center gap-2 border-l-4 border-blue-500 pl-3">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-semibold text-blue-400 mt-6 mb-3">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="text-slate-300 leading-7 mb-5 text-sm">{children}</p>
  ),
  table: ({ children }) => (
    <div className="my-6 overflow-x-auto rounded-lg border border-slate-700">
      <table className="w-full text-sm text-left border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-800 text-slate-200">{children}</thead>,
  th: ({ children }) => <th className="px-4 py-3 border-b border-slate-700 font-medium">{children}</th>,
  td: ({ children }) => <td className="px-4 py-3 border-b border-slate-800 text-slate-400">{children}</td>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
      {children}
    </a>
  ),
  code({ node, inline, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '');
    return !inline && match ? (
      <div className="my-5 rounded-lg overflow-hidden border border-slate-700">
        <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div" customStyle={{ margin: 0, padding: '1.25rem', fontSize: '12px' }} {...props}>
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      </div>
    ) : (
      <code className="bg-slate-800 text-blue-300 px-1.5 py-0.5 rounded font-mono text-xs" {...props}>{children}</code>
    );
  },
};

// ---------------------------------------------------------------------------
// Small shared components
// ---------------------------------------------------------------------------
function LogPanel({ logs, title = 'Console' }) {
  const [expanded, setExpanded] = useState(null);
  const levelColor = { ERROR: 'text-red-400', WARN: 'text-amber-400', INFO: 'text-blue-400', DEBUG: 'text-slate-500' };

  return (
    <div className="flex flex-col h-full font-mono text-[11px]">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <span className="text-slate-400 font-semibold text-xs">{title}</span>
        <span className="text-slate-600 text-[10px]">{logs.length} entries</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {logs.length === 0 ? (
          <p className="text-slate-700 italic text-center mt-8">No log entries yet</p>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="border-l-2 border-slate-800 pl-3 py-0.5 hover:bg-slate-900/50 cursor-pointer rounded-r" onClick={() => setExpanded(expanded === i ? null : i)}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`font-bold text-[10px] ${levelColor[log.level] || 'text-slate-400'}`}>{log.level}</span>
                <span className="text-slate-700 tabular-nums">{log.timestamp.split('T')[1]?.slice(0, 8)}</span>
                {log.data && <span className="text-[9px] text-slate-600">[{expanded === i ? '−' : '+'}]</span>}
              </div>
              <div className="text-slate-400 leading-relaxed whitespace-pre-wrap">{log.message}</div>
              {expanded === i && log.data && (
                <pre className="mt-2 p-2 bg-black/60 border border-slate-800 rounded text-blue-300 overflow-x-auto whitespace-pre-wrap text-[10px]">{log.data}</pre>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ReportView({ markdown, onExport, isExporting }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
        <div className="flex items-center gap-2">
          <SafeIcon name="FileText" className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-slate-300">Generated Report</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => navigator.clipboard.writeText(markdown)} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            Copy Markdown
          </button>
          {onExport && (
            <button onClick={onExport} disabled={isExporting} className="text-xs text-blue-400 hover:text-blue-300 disabled:text-slate-600 flex items-center gap-1.5 transition-colors">
              <SafeIcon name={isExporting ? 'RefreshCcw' : 'Download'} className={`w-3 h-3 ${isExporting ? 'animate-spin' : ''}`} />
              Export PDF
            </button>
          )}
        </div>
      </div>
      <div className="p-8">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>{markdown}</ReactMarkdown>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// History tab
// ---------------------------------------------------------------------------
function HistoryTab({ history, onDelete }) {
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState('report');

  const entry = history.find(h => h.id === selected);

  if (selected && entry) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white flex items-center gap-1.5 text-sm transition-colors">
            <SafeIcon name="ArrowLeft" className="w-4 h-4" /> Back to history
          </button>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-slate-500 text-xs mb-1">{new Date(entry.date).toLocaleString()}</p>
          <p className="text-white font-medium">{entry.query}</p>
        </div>

        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1 w-fit">
          {['report', 'logs'].map(v => (
            <button key={v} onClick={() => setView(v)} className={`px-4 py-1.5 rounded text-xs font-medium capitalize transition-colors ${view === v ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              {v === 'logs' ? 'Console Log' : 'Report'}
            </button>
          ))}
        </div>

        {view === 'report' ? (
          <ReportView markdown={entry.report} />
        ) : (
          <div className="bg-slate-950 border border-slate-800 rounded-xl h-[600px] overflow-hidden">
            <LogPanel logs={entry.logs || []} title={`Console — ${entry.query.slice(0, 50)}…`} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-200">Research History</h2>
        {history.length > 0 && (
          <button onClick={() => { HistoryService.clear(); onDelete(); }} className="text-xs text-slate-600 hover:text-red-400 transition-colors">
            Clear all
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
          <SafeIcon name="Clock" className="w-8 h-8 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No past research runs yet.</p>
          <p className="text-slate-600 text-xs mt-1">Completed reports will appear here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {history.map(item => (
            <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-4 hover:border-slate-700 transition-colors group">
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelected(item.id)}>
                <p className="text-slate-200 text-sm font-medium truncate">{item.query}</p>
                <p className="text-slate-600 text-xs mt-1">{new Date(item.date).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <button onClick={() => setSelected(item.id)} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                  View
                </button>
                <button onClick={() => { HistoryService.remove(item.id); onDelete(); }} className="text-xs text-slate-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function CompilerUI() {
  const [activeTab, setActiveTab] = useState('compiler');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('idle');
  const [progressMsg, setProgressMsg] = useState('');
  const [report, setReport] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [logs, setLogs] = useState([]);
  const [showConsole, setShowConsole] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const unsubscribe = systemLog.subscribe(setLogs);
    setHistory(HistoryService.load());
    return () => unsubscribe();
  }, []);

  const isRunning = ['translating', 'executing', 'synthesizing'].includes(status);

  const handleCompile = async () => {
    if (!query.trim()) return;
    setStatus('translating');
    setProgressMsg('Decomposing research query…');
    setReport('');
    systemLog.clear();
    PersistenceService.clear();

    try {
      const plan = await translateQuery(query);
      setStatus('executing');
      const { database, sources } = await executePlan(plan, msg => setProgressMsg(msg));
      setStatus('synthesizing');
      setProgressMsg('Synthesising report…');
      const finalReport = await generateProfessionalReport(database, sources);
      setReport(finalReport.markdown);
      setStatus('complete');
      setProgressMsg('');
      HistoryService.save({ query, report: finalReport.markdown, logs: [...systemLog.logs] });
      setHistory(HistoryService.load());
    } catch (err) {
      setStatus('error');
      systemLog.error('Pipeline error', err.message);
      setProgressMsg('Error: ' + err.message);
    }
  };

  const handleExportPdf = async () => {
    if (!report) return;
    setIsExporting(true);
    try {
      await exportToPdf(report, `Research_Report_${Date.now()}.pdf`);
    } catch (err) {
      systemLog.error('Export failed', err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const statusLabel = {
    idle: 'Ready',
    translating: 'Translating query…',
    executing: 'Executing searches…',
    synthesizing: 'Synthesising report…',
    complete: 'Complete',
    error: 'Error',
  }[status] ?? status;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-blue-600/20 rounded-lg border border-blue-600/30">
              <SafeIcon name="Terminal" className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <span className="text-white font-semibold text-sm">Research Compiler</span>
              <span className="text-blue-500 text-sm font-semibold ml-1.5">v2.1</span>
            </div>
          </div>

          {/* Tabs */}
          <nav className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
            {[{ id: 'compiler', icon: 'Play', label: 'Compiler' }, { id: 'history', icon: 'Clock', label: 'History' }].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-4 py-1.5 rounded text-xs font-medium transition-colors ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                <SafeIcon name={tab.icon} className="w-3.5 h-3.5" />
                {tab.label}
                {tab.id === 'history' && history.length > 0 && (
                  <span className="bg-slate-700 text-slate-300 text-[10px] px-1.5 py-0.5 rounded-full">{history.length}</span>
                )}
              </button>
            ))}
          </nav>

          <button onClick={() => setShowConsole(v => !v)} className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border transition-colors ${showConsole ? 'border-blue-600/50 text-blue-400 bg-blue-600/10' : 'border-slate-800 text-slate-500 hover:text-white'}`}>
            <SafeIcon name="Activity" className="w-3.5 h-3.5" />
            Console
            {logs.length > 0 && <span className="text-[10px] text-slate-600">{logs.length}</span>}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className={`grid gap-6 ${showConsole && activeTab === 'compiler' ? 'grid-cols-[1fr_360px]' : 'grid-cols-1'}`}>

          {/* Main panel */}
          <main className="space-y-6 min-w-0">
            {activeTab === 'compiler' ? (
              <>
                {/* Input */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                  <label className="block text-xs font-medium text-slate-500 mb-3 uppercase tracking-wider">Research Question</label>
                  <textarea
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-4 text-sm text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-blue-600 transition-colors resize-y min-h-[120px] leading-relaxed"
                    placeholder="e.g. Compare the water sustainability policies of Rio Tinto and BHP Group from 2023"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    disabled={isRunning}
                  />
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs text-slate-600">{statusLabel}</span>
                    <button
                      onClick={handleCompile}
                      disabled={isRunning || !query.trim()}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      <SafeIcon name={isRunning ? 'RefreshCcw' : 'Play'} className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
                      {isRunning ? 'Running…' : 'Compile Research'}
                    </button>
                  </div>
                </div>

                {/* Progress */}
                {isRunning && (
                  <div className="bg-blue-600/5 border border-blue-600/20 rounded-xl p-4 flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full border-2 border-blue-600/30 border-t-blue-500 animate-spin flex-shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-blue-400 uppercase tracking-wide">{status}</p>
                      <p className="text-sm text-slate-400 mt-0.5">{progressMsg}</p>
                    </div>
                  </div>
                )}

                {/* Error */}
                {status === 'error' && (
                  <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 flex items-center gap-3">
                    <SafeIcon name="AlertCircle" className="w-5 h-5 text-red-400 flex-shrink-0" />
                    <p className="text-sm text-red-300">{progressMsg}</p>
                  </div>
                )}

                {/* Report */}
                {report && (
                  <ReportView markdown={report} onExport={handleExportPdf} isExporting={isExporting} />
                )}
              </>
            ) : (
              <HistoryTab history={history} onDelete={() => setHistory(HistoryService.load())} />
            )}
          </main>

          {/* Console panel — only shown in compiler tab */}
          {showConsole && activeTab === 'compiler' && (
            <aside className="bg-slate-950 border border-slate-800 rounded-xl h-[calc(100vh-120px)] sticky top-[73px] overflow-hidden">
              <LogPanel logs={logs} title={`Console · ${status}`} />
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
