import React, { useState, useEffect, useRef } from 'react';
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
    <h1 className="text-2xl font-bold text-white mb-6 pb-3 border-b border-slate-700/60">{children}</h1>
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
    <div className="my-6 overflow-x-auto rounded-xl border border-slate-700/60">
      <table className="w-full text-sm text-left border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-800/80 text-slate-200">{children}</thead>,
  th: ({ children }) => <th className="px-4 py-3 border-b border-slate-700/60 font-medium">{children}</th>,
  td: ({ children }) => <td className="px-4 py-3 border-b border-slate-800/80 text-slate-400">{children}</td>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors">
      {children}
    </a>
  ),
  code({ node, inline, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '');
    return !inline && match ? (
      <div className="my-5 rounded-xl overflow-hidden border border-slate-700/60">
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
// Progress bar
// ---------------------------------------------------------------------------
const PIPELINE_STEPS = [
  { key: 'translating', label: 'Translating' },
  { key: 'executing',   label: 'Searching'   },
  { key: 'synthesizing', label: 'Synthesising' },
  { key: 'complete',    label: 'Complete'     },
];

function ProgressBar({ pct, status, progressMsg }) {
  const activeStep = PIPELINE_STEPS.findIndex(s => s.key === status);
  const isDone = status === 'complete';

  return (
    <div className="bg-slate-900/80 border border-slate-700/60 rounded-2xl p-5 space-y-4 shadow-lg">
      {/* Step indicators */}
      <div className="flex items-center gap-0">
        {PIPELINE_STEPS.map((step, i) => {
          const done = isDone ? true : i < activeStep;
          const active = i === activeStep && !isDone;
          return (
            <React.Fragment key={step.key}>
              <div className="flex flex-col items-center gap-1.5">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all duration-500
                  ${isDone ? 'bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                    : done ? 'bg-blue-600 text-white'
                    : active ? 'bg-blue-600/20 border-2 border-blue-500 text-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.3)]'
                    : 'bg-slate-800 border border-slate-700 text-slate-600'}`}>
                  {isDone ? <SafeIcon name="Check" className="w-3.5 h-3.5" />
                    : done ? <SafeIcon name="Check" className="w-3.5 h-3.5" />
                    : i + 1}
                </div>
                <span className={`text-[10px] font-medium transition-colors duration-300
                  ${isDone ? 'text-emerald-400' : done ? 'text-blue-400' : active ? 'text-blue-300' : 'text-slate-600'}`}>
                  {step.label}
                </span>
              </div>
              {i < PIPELINE_STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-1 mb-4 transition-all duration-700
                  ${done || isDone ? 'bg-blue-600' : 'bg-slate-700'}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400 truncate max-w-[80%]">
            {isDone ? 'Research complete' : progressMsg || 'Starting…'}
          </span>
          <span className={`text-xs font-semibold tabular-nums ml-3 flex-shrink-0 transition-colors duration-300
            ${isDone ? 'text-emerald-400' : 'text-blue-400'}`}>
            {Math.round(pct)}%
          </span>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out
              ${isDone
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                : 'bg-gradient-to-r from-blue-600 via-blue-500 to-violet-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Log panel
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

// ---------------------------------------------------------------------------
// Report view
// ---------------------------------------------------------------------------
function ReportView({ markdown, onExport, isExporting }) {
  return (
    <div className="bg-slate-900/80 border border-slate-700/60 rounded-2xl overflow-hidden shadow-xl">
      <div className="px-5 py-3.5 border-b border-slate-700/60 flex items-center justify-between bg-slate-900/60 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <div className="p-1 bg-blue-500/10 rounded-md border border-blue-500/20">
            <SafeIcon name="FileText" className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <span className="text-sm font-semibold text-slate-200">Generated Report</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigator.clipboard.writeText(markdown)}
            className="text-xs text-slate-500 hover:text-slate-200 transition-colors flex items-center gap-1.5"
          >
            <SafeIcon name="Copy" className="w-3 h-3" />
            Copy Markdown
          </button>
          {onExport && (
            <button
              onClick={onExport}
              disabled={isExporting}
              className="text-xs text-blue-400 hover:text-blue-300 disabled:text-slate-600 flex items-center gap-1.5 transition-colors"
            >
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
        <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white flex items-center gap-1.5 text-sm transition-colors">
          <SafeIcon name="ArrowLeft" className="w-4 h-4" /> Back to history
        </button>

        <div className="bg-slate-900/80 border border-slate-700/60 rounded-2xl p-5">
          <p className="text-slate-500 text-xs mb-1">{new Date(entry.date).toLocaleString()}</p>
          <p className="text-white font-medium">{entry.query}</p>
        </div>

        <div className="flex gap-1 bg-slate-900/80 border border-slate-700/60 rounded-xl p-1 w-fit">
          {['report', 'logs'].map(v => (
            <button key={v} onClick={() => setView(v)} className={`px-4 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${view === v ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>
              {v === 'logs' ? 'Console Log' : 'Report'}
            </button>
          ))}
        </div>

        {view === 'report' ? (
          <ReportView markdown={entry.report} />
        ) : (
          <div className="bg-slate-950 border border-slate-800 rounded-2xl h-[600px] overflow-hidden">
            <LogPanel logs={entry.logs || []} title={`Console — ${entry.query.slice(0, 50)}…`} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-200">Research History</h2>
        {history.length > 0 && (
          <button onClick={() => { HistoryService.clear(); onDelete(); }} className="text-xs text-slate-600 hover:text-red-400 transition-colors">
            Clear all
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="bg-slate-900/80 border border-slate-700/60 rounded-2xl p-14 text-center">
          <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <SafeIcon name="Clock" className="w-5 h-5 text-slate-600" />
          </div>
          <p className="text-slate-400 text-sm font-medium">No research history yet</p>
          <p className="text-slate-600 text-xs mt-1">Completed reports will appear here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {history.map(item => (
            <div key={item.id} className="bg-slate-900/80 border border-slate-700/60 rounded-xl p-4 flex items-center justify-between gap-4 hover:border-slate-600 transition-colors group cursor-pointer" onClick={() => setSelected(item.id)}>
              <div className="flex-1 min-w-0">
                <p className="text-slate-200 text-sm font-medium truncate">{item.query}</p>
                <p className="text-slate-600 text-xs mt-0.5">{new Date(item.date).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs text-blue-400 group-hover:text-blue-300 transition-colors">View →</span>
                <button
                  onClick={e => { e.stopPropagation(); HistoryService.remove(item.id); onDelete(); }}
                  className="text-xs text-slate-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                >
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
  const [progressPct, setProgressPct] = useState(0);
  const [report, setReport] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [logs, setLogs] = useState([]);
  const [showConsole, setShowConsole] = useState(false);
  const [history, setHistory] = useState([]);
  const [runMode, setRunMode] = useState(null);
  const progressRef = useRef(0);

  useEffect(() => {
    const unsubscribe = systemLog.subscribe(setLogs);
    setHistory(HistoryService.load());
    return () => unsubscribe();
  }, []);

  const isRunning = ['translating', 'executing', 'synthesizing'].includes(status);
  const showProgress = isRunning || status === 'complete';

  const setProgress = (pct) => {
    progressRef.current = pct;
    setProgressPct(pct);
  };

  const handleCompile = async (mode) => {
    if (!query.trim()) return;
    setRunMode(mode);
    setReport('');
    systemLog.clear();
    PersistenceService.clear();
    setProgress(0);

    try {
      setStatus('translating');
      setProgressMsg('Decomposing research query…');
      setProgress(8);

      const plan = await translateQuery(query);
      setProgress(18);

      setStatus('executing');
      setProgressMsg('Starting searches…');
      setProgress(22);

      const { database, sources } = await executePlan(plan, msg => {
        setProgressMsg(msg);
        const next = Math.min(78, progressRef.current + 3.5);
        setProgress(next);
      }, mode);

      setStatus('synthesizing');
      setProgressMsg('Synthesising report…');
      setProgress(83);

      const finalReport = await generateProfessionalReport(database, sources, mode);
      setProgress(100);
      setReport(finalReport.markdown);
      setStatus('complete');
      setProgressMsg('');
      setRunMode(null);
      HistoryService.save({ query, report: finalReport.markdown, logs: [...systemLog.logs] });
      setHistory(HistoryService.load());
    } catch (err) {
      setStatus('error');
      setRunMode(null);
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

  return (
    <div className="min-h-screen bg-[#0b0f1a] text-slate-300">
      {/* Header */}
      <header className="border-b border-slate-800/80 bg-[#0b0f1a]/90 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-600/30 to-violet-600/20 rounded-xl border border-blue-500/30 shadow-[0_0_16px_rgba(59,130,246,0.15)]">
              <SafeIcon name="BookOpen" className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <span className="text-white font-bold text-sm tracking-tight">Research Compiler</span>
              <span className="text-blue-500/80 text-xs font-medium ml-2 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded-md">v2.1</span>
            </div>
          </div>

          <nav className="flex items-center gap-1 bg-slate-900/80 border border-slate-700/60 rounded-xl p-1">
            {[{ id: 'compiler', icon: 'Search', label: 'Compiler' }, { id: 'history', icon: 'Clock', label: 'History' }].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>
                <SafeIcon name={tab.icon} className="w-3.5 h-3.5" />
                {tab.label}
                {tab.id === 'history' && history.length > 0 && (
                  <span className="bg-slate-700 text-slate-300 text-[10px] px-1.5 py-0.5 rounded-full">{history.length}</span>
                )}
              </button>
            ))}
          </nav>

          <button onClick={() => setShowConsole(v => !v)} className={`flex items-center gap-2 text-xs px-3.5 py-1.5 rounded-xl border transition-all ${showConsole ? 'border-blue-500/50 text-blue-400 bg-blue-600/10 shadow-[0_0_12px_rgba(59,130,246,0.1)]' : 'border-slate-700/60 text-slate-500 hover:text-white hover:border-slate-600'}`}>
            <SafeIcon name="Activity" className="w-3.5 h-3.5" />
            Console
            {logs.length > 0 && <span className="text-[10px] text-slate-600">{logs.length}</span>}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className={`grid gap-6 ${showConsole && activeTab === 'compiler' ? 'grid-cols-[1fr_360px]' : 'grid-cols-1'}`}>

          <main className="space-y-5 min-w-0">
            {activeTab === 'compiler' ? (
              <>
                {/* Input card */}
                <div className="bg-slate-900/60 border border-slate-700/60 rounded-2xl p-6 shadow-lg">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-3 uppercase tracking-widest">Research Question</label>
                  <textarea
                    className="w-full bg-slate-950/80 border border-slate-700/60 rounded-xl p-4 text-sm text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-blue-500/70 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1)] transition-all resize-y min-h-[120px] leading-relaxed"
                    placeholder="e.g. Compare the water sustainability policies of Rio Tinto and BHP Group from 2023"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    disabled={isRunning}
                  />
                  <div className="mt-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <SafeIcon name="Info" className="w-3 h-3" />
                      <span>Brief uses Tier 0 search only · Deep runs full pipeline</span>
                    </div>
                    <div className="flex items-center gap-2.5 flex-shrink-0">
                      <button
                        onClick={() => handleCompile('brief')}
                        disabled={isRunning || !query.trim()}
                        className="flex items-center gap-2 bg-slate-700/80 hover:bg-slate-600/80 disabled:bg-slate-800/50 disabled:text-slate-600 text-slate-200 px-4 py-2 rounded-xl text-sm font-medium transition-all border border-slate-600/60 hover:border-slate-500/60 disabled:border-slate-800/50"
                      >
                        <SafeIcon name={isRunning && runMode === 'brief' ? 'RefreshCcw' : 'Zap'} className={`w-3.5 h-3.5 ${isRunning && runMode === 'brief' ? 'animate-spin' : 'text-amber-400'}`} />
                        {isRunning && runMode === 'brief' ? 'Running…' : 'Brief Overview'}
                      </button>
                      <button
                        onClick={() => handleCompile('deep')}
                        disabled={isRunning || !query.trim()}
                        className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 text-white px-5 py-2 rounded-xl text-sm font-semibold transition-all shadow-[0_0_20px_rgba(59,130,246,0.25)] hover:shadow-[0_0_24px_rgba(59,130,246,0.35)] disabled:shadow-none"
                      >
                        <SafeIcon name={isRunning && runMode === 'deep' ? 'RefreshCcw' : 'Play'} className={`w-3.5 h-3.5 ${isRunning && runMode === 'deep' ? 'animate-spin' : ''}`} />
                        {isRunning && runMode === 'deep' ? 'Running…' : 'Deep Research Report'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                {showProgress && (
                  <ProgressBar pct={progressPct} status={status} progressMsg={progressMsg} />
                )}

                {/* Error */}
                {status === 'error' && (
                  <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 flex items-center gap-3">
                    <div className="p-1.5 bg-red-500/10 rounded-lg flex-shrink-0">
                      <SafeIcon name="AlertCircle" className="w-4 h-4 text-red-400" />
                    </div>
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

          {/* Console panel */}
          {showConsole && activeTab === 'compiler' && (
            <aside className="bg-slate-950 border border-slate-800 rounded-2xl h-[calc(100vh-120px)] sticky top-[65px] overflow-hidden">
              <LogPanel logs={logs} title={`Console · ${status}`} />
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
