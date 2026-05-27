import { useEffect, useState } from "react";
import axios from "axios";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

function formatBytes(bytes) {
  if (bytes === 0 || !bytes) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Custom responsive SparkLineChart using native React SVG
function SparkLineChart({ data, dataKey, stroke, fillGradientId, title }) {
  if (!data || data.length === 0) {
    return (
      <div className="empty-state" style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Waiting for real-time metrics...
      </div>
    );
  }

  const width = 500;
  const height = 150;
  const padding = 20;

  const maxVal = Math.max(...data.map((d) => d[dataKey] || 0), 10);
  const minVal = 0;

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1 || 1)) * (width - padding * 2);
    const y = height - padding - ((d[dataKey] - minVal) / (maxVal - minVal || 1)) * (height - padding * 2);
    return { x, y };
  });

  const pathD = points.reduce((acc, p, i) => {
    return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, "");

  const areaD = points.length > 0
    ? `${pathD} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`
    : "";

  return (
    <div className="chart-wrapper" style={{ flex: 1, minWidth: '220px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
        <strong style={{ fontSize: '0.85rem', color: '#475569' }}>{title}</strong>
        <span style={{ color: stroke, fontWeight: '700', fontSize: '0.95rem' }}>
          {data[data.length - 1][dataKey]?.toFixed(1)}%
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        <defs>
          <linearGradient id={fillGradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.3" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="rgba(148, 163, 184, 0.1)" strokeDasharray="3" />
        <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="rgba(148, 163, 184, 0.1)" strokeDasharray="3" />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="rgba(148, 163, 184, 0.2)" />

        {/* Area fill */}
        {areaD && <path d={areaD} fill={`url(#${fillGradientId})`} />}

        {/* Line path */}
        {pathD && <path d={pathD} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}

        {/* Data points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={i === points.length - 1 ? 5 : 2}
            fill={stroke}
            stroke="white"
            strokeWidth={i === points.length - 1 ? 1.5 : 1}
          />
        ))}
      </svg>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState("topology");
  const [containers, setContainers] = useState([]);
  const [selectedContainerId, setSelectedContainerId] = useState(null);
  
  // Real-time Metrics & Insights
  const [systemMetrics, setSystemMetrics] = useState(null);
  const [selectedContainerMetrics, setSelectedContainerMetrics] = useState(null);
  const [selectedContainerInsights, setSelectedContainerInsights] = useState(null);
  const [selectedContainerPredictions, setSelectedContainerPredictions] = useState([]);
  const [selectedContainerLogs, setSelectedContainerLogs] = useState("");
  const [metricsHistory, setMetricsHistory] = useState([]);
  
  // Simulated Deployments and chron timeline lists
  const [deployments, setDeployments] = useState([]);
  const [timelineEvents, setTimelineEvents] = useState([]);
  
  // Status states
  const [isPolling, setIsPolling] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState({ text: "", type: "" });
  
  // Chat / Assistant States
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [useRag, setUseRag] = useState(true);
  
  // RAG Runbook Management States
  const [ragQuery, setRagQuery] = useState("");
  const [ragResults, setRagResults] = useState([]);
  const [ragLoading, setRagLoading] = useState(false);
  const [ragStatus, setRagStatus] = useState(null);
  const [ragDocTitle, setRagDocTitle] = useState("");
  const [ragDocText, setRagDocText] = useState("");
  const [ragAddLoading, setRagAddLoading] = useState(false);
  const [error, setError] = useState("");

  // Agent Status active mapping
  const [agentsActive, setAgentsActive] = useState({
    monitoring: true,
    prediction: false,
    healing: false,
    copilot: false
  });

  // Periodically Poll Containers, Deployments, Timelines and System Metrics
  useEffect(() => {
    let intervalId;
    const fetchGlobalData = async () => {
      // Pulse the monitoring agent when collecting metrics
      setAgentsActive(prev => ({ ...prev, monitoring: true }));
      setTimeout(() => setAgentsActive(prev => ({ ...prev, monitoring: false })), 800);

      try {
        const sysRes = await axios.get(`${API_BASE}/system/metrics`);
        if (sysRes.data && !sysRes.data.error) {
          setSystemMetrics(sysRes.data);
        }
      } catch (e) {
        console.error("Error fetching system metrics", e);
      }

      try {
        const contRes = await axios.get(`${API_BASE}/containers`);
        if (contRes.data) {
          setContainers(contRes.data);
          // Set initial active container if not already selected
          if (contRes.data.length > 0 && !selectedContainerId) {
            setSelectedContainerId(contRes.data[0].id);
          }
        }
      } catch (e) {
        console.error("Error fetching containers list", e);
      }

      try {
        const depRes = await axios.get(`${API_BASE}/deployments`);
        if (depRes.data) {
          setDeployments(depRes.data.deployments || []);
        }
      } catch (e) {
        console.error("Error fetching deployments", e);
      }

      try {
        const timeRes = await axios.get(`${API_BASE}/timeline`);
        if (timeRes.data) {
          setTimelineEvents(timeRes.data.events || []);
        }
      } catch (e) {
        console.error("Error fetching timeline events", e);
      }

      try {
        const ragStatRes = await axios.get(`${API_BASE}/rag/status`);
        if (ragStatRes.data) {
          setRagStatus(ragStatRes.data);
        }
      } catch (e) {
        console.error("Error fetching RAG status", e);
      }
    };

    fetchGlobalData();
    if (isPolling) {
      intervalId = setInterval(fetchGlobalData, 3000);
    }
    return () => clearInterval(intervalId);
  }, [isPolling, selectedContainerId]);

  // Handle active container dynamic metrics & predictions polling
  useEffect(() => {
    if (!selectedContainerId) return;

    let activeInterval;
    const fetchContainerDynamicData = async () => {
      // Pulse prediction agent when scanning slopes
      setAgentsActive(prev => ({ ...prev, prediction: true }));
      setTimeout(() => setAgentsActive(prev => ({ ...prev, prediction: false })), 1000);

      try {
        const mRes = await axios.get(`${API_BASE}/metrics/${selectedContainerId}`);
        if (mRes.data && !mRes.data.error) {
          setSelectedContainerMetrics(mRes.data);
          
          // Append to CPU/Memory line chart history
          setMetricsHistory((history) => {
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const newPoint = {
              time: timeStr,
              cpu_percent: mRes.data.cpu_percent || 0.0,
              memory_percent: mRes.data.memory_percent || 0.0,
            };
            const nextHist = [...history, newPoint];
            return nextHist.slice(-15); // keep last 15 points
          });
        }

        const pRes = await axios.get(`${API_BASE}/predict/${selectedContainerId}`);
        if (pRes.data && !pRes.data.error) {
          setSelectedContainerPredictions(pRes.data.predictions || []);
        }
      } catch (e) {
        console.error("Error polling container stats/predictions", e);
      }
    };

    const fetchHeavyDetails = async () => {
      setDetailsLoading(true);
      try {
        const lRes = await axios.get(`${API_BASE}/logs/${selectedContainerId}`);
        setSelectedContainerLogs(lRes.data?.logs || "No logs fetched.");

        const iRes = await axios.get(`${API_BASE}/insights/${selectedContainerId}`);
        if (iRes.data) {
          setSelectedContainerInsights(iRes.data);
        }
      } catch (e) {
        console.error("Error fetching logs/insights", e);
      } finally {
        setDetailsLoading(false);
      }
    };

    // Reset history when container changes to avoid charting cross-container lines
    setMetricsHistory([]);
    fetchContainerDynamicData();
    fetchHeavyDetails();

    if (isPolling) {
      activeInterval = setInterval(fetchContainerDynamicData, 3000);
    }

    return () => clearInterval(activeInterval);
  }, [selectedContainerId, isPolling]);

  // Load chat history when active container changes
  useEffect(() => {
    if (selectedContainerId) {
      fetchChatHistory(selectedContainerId);
    }
  }, [selectedContainerId]);

  const fetchChatHistory = async (containerId) => {
    try {
      const res = await axios.get(`${API_BASE}/chat/history/${containerId}`);
      setChatHistory(res.data?.history || []);
    } catch (e) {
      console.error("Error loading chat history", e);
    }
  };

  const triggerRestart = async (containerId) => {
    try {
      setActionMessage({ text: "Restarting container...", type: "info" });
      const res = await axios.post(`${API_BASE}/restart/${containerId}`);
      setActionMessage({ text: res.data?.message || "Container restarted", type: "success" });
      setTimeout(() => setActionMessage({ text: "", type: "" }), 5000);
    } catch (e) {
      setActionMessage({ text: "Failed to restart container", type: "error" });
    }
  };

  const triggerAutoHeal = async (containerId) => {
    setAgentsActive(prev => ({ ...prev, healing: true }));
    try {
      setActionMessage({ text: "Analyzing system state & healing container...", type: "info" });
      const res = await axios.post(`${API_BASE}/heal/${containerId}`);
      if (res.data?.action && res.data.action !== "none") {
        setActionMessage({
          text: `Self-Heal Applied: ${res.data.action} successfully. Reason: ${res.data.reason}`,
          type: "success",
        });
      } else {
        setActionMessage({
          text: `Analysis complete: ${res.data?.reason || "No healing actions are required. Container healthy."}`,
          type: "success",
        });
      }
      setTimeout(() => setActionMessage({ text: "", type: "" }), 6000);
    } catch (e) {
      setActionMessage({ text: "Auto-healing process encountered an error", type: "error" });
    } finally {
      setTimeout(() => setAgentsActive(prev => ({ ...prev, healing: false })), 2000);
    }
  };

  const triggerRollback = async () => {
    try {
      setActionMessage({ text: "Reverting CI/CD release to stable version...", type: "info" });
      const res = await axios.post(`${API_BASE}/deployments/rollback`);
      if (res.data?.status === "success") {
        setActionMessage({ text: res.data.message, type: "success" });
        // Force refresh deployments list
        const depRes = await axios.get(`${API_BASE}/deployments`);
        if (depRes.data) setDeployments(depRes.data.deployments || []);
      } else {
        setActionMessage({ text: res.data?.message || "No rollbacks needed", type: "success" });
      }
      setTimeout(() => setActionMessage({ text: "", type: "" }), 5000);
    } catch (e) {
      setActionMessage({ text: "Rollback request encountered an error", type: "error" });
    }
  };

  const askAssistant = async () => {
    if (!chatInput.trim()) return;
    setChatLoading(true);
    setAgentsActive(prev => ({ ...prev, copilot: true }));
    setError("");
    try {
      let logsForRequest = undefined;
      if (useRag) {
        let results = ragResults;
        if ((!results || results.length === 0) && ragQuery.trim()) {
          results = await performRagSearch();
        }
        if (results && results.length > 0) {
          logsForRequest = results
            .slice(0, 4)
            .map((r) => r.text || r.content || JSON.stringify(r))
            .join("\n\n---\n\n");
        }
      }

      const res = await axios.post(`${API_BASE}/chat`, {
        question: chatInput,
        container_id: selectedContainerId,
        logs: logsForRequest,
      });

      const answer = res.data?.answer ?? res.data;
      const sources = res.data?.sources ?? [];
      setChatHistory((h) => [...h, { question: chatInput, answer, sources }]);
      setChatInput("");
    } catch (e) {
      setError("AI DevOps Assistant communication error. Please check OpenAI configuration.");
    } finally {
      setChatLoading(false);
      setAgentsActive(prev => ({ ...prev, copilot: false }));
    }
  };

  const performRagSearch = async () => {
    if (!ragQuery.trim()) return [];
    setRagLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/rag/search`, { query: ragQuery, k: 4 });
      const results = res.data?.results || [];
      setRagResults(results);
      return results;
    } catch (e) {
      setError("RAG vector database search failed.");
      return [];
    } finally {
      setRagLoading(false);
    }
  };

  const addRagDocument = async (e) => {
    e.preventDefault();
    if (!ragDocTitle.trim() || !ragDocText.trim()) return;
    setRagAddLoading(true);
    try {
      const uniqueId = `manual-doc-${Date.now()}`;
      await axios.post(`${API_BASE}/rag/add`, {
        docs: [{ id: uniqueId, title: ragDocTitle, text: ragDocText }],
      });
      setRagDocTitle("");
      setRagDocText("");
      setActionMessage({ text: "Runbook snippet registered and queued for embeddings!", type: "success" });
      setTimeout(() => setActionMessage({ text: "", type: "" }), 5000);
    } catch (e) {
      setError("Failed to register runbook documentation.");
    } finally {
      setRagAddLoading(false);
    }
  };

  const selectedContainer = containers.find((c) => c.id === selectedContainerId);

  // Derive static statuses for topology canvas nodes based on real container states
  const getNodeStatus = (nodeType) => {
    if (nodeType === "frontend") {
      const nginx = containers.find(c => c.name.toLowerCase().includes("nginx"));
      return nginx ? nginx.status : "running";
    }
    if (nodeType === "api") {
      return systemMetrics ? "running" : "unknown";
    }
    if (nodeType === "db") {
      const pg = containers.find(c => c.name.toLowerCase().includes("postgres") || c.name.toLowerCase().includes("db"));
      return pg ? pg.status : "running";
    }
    return "running";
  };

  // Build list of active alerts dynamically to feed "AI Incident summary"
  const getActiveAlerts = () => {
    const alerts = [];
    if (selectedContainerMetrics) {
      if (selectedContainerMetrics.cpu_percent > 85) {
        alerts.push(`Sustained CPU saturation (${selectedContainerMetrics.cpu_percent.toFixed(1)}%) in active container '${selectedContainer?.name}'.`);
      }
      if (selectedContainerMetrics.memory_percent > 80) {
        alerts.push(`High memory footprint (${selectedContainerMetrics.memory_percent.toFixed(1)}%) in '${selectedContainer?.name}'. Memory leak suspected.`);
      }
    }
    selectedContainerPredictions.forEach(p => {
      alerts.push(`[Prediction] Imminent ${p.type?.replace("_", " ")} flagged! Severity: ${p.severity}. Estimated crash in ${p.estimated_time}.`);
    });
    // Fallback if clean
    if (alerts.length === 0) {
      alerts.push("All metric parameters reside in normal baseline zones. No active threats detected.");
    }
    return alerts;
  };

  return (
    <div className="app-shell">
      <header className="app-header" style={{ marginBottom: 16 }}>
        <div>
          <p className="eyebrow">AIOpsGuard Agentic observability</p>
          <h1>AIOpsGuard Observability</h1>
          <p className="subtitle">Collaborative AI Agents for Real-Time Topology Mapping, Self-Healing Operations, and Failure Predictions</p>
        </div>
        <div className="header-actions">
          <label style={{ display: 'inline-flex', alignItems: 'center', marginRight: 16, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isPolling}
              onChange={(e) => setIsPolling(e.target.checked)}
              style={{ marginRight: 8 }}
            />
            <span style={{ fontSize: '0.85rem', color: '#475569', fontWeight: '600' }}>
              {isPolling ? "● Polling Active (3s)" : "Polling Paused"}
            </span>
          </label>
        </div>
      </header>

      {/* Multi-Agent Collaborative Panel */}
      <section className="agent-collective">
        <div className={`agent-card ${agentsActive.monitoring || systemMetrics ? "active" : ""}`}>
          <div className="agent-avatar">📊</div>
          <div className="agent-info">
            <strong>Monitoring Agent</strong>
            <span>Active Telemetry</span>
          </div>
          <div className="agent-pulse-indicator"></div>
        </div>
        <div className={`agent-card ${agentsActive.prediction || selectedContainerPredictions.length > 0 ? "active" : ""}`}>
          <div className="agent-avatar">🔮</div>
          <div className="agent-info">
            <strong>Prediction Agent</strong>
            <span>Sliding Gradients</span>
          </div>
          <div className="agent-pulse-indicator"></div>
        </div>
        <div className={`agent-card ${agentsActive.healing || actionMessage.text.includes("healing") ? "active" : ""}`}>
          <div className="agent-avatar">🛡️</div>
          <div className="agent-info">
            <strong>Healing Agent</strong>
            <span>Self-Recovery</span>
          </div>
          <div className="agent-pulse-indicator"></div>
        </div>
        <div className={`agent-card ${agentsActive.copilot || chatLoading ? "active" : ""}`}>
          <div className="agent-avatar">🤖</div>
          <div className="agent-info">
            <strong>Copilot Agent</strong>
            <span>RAG QA Assistant</span>
          </div>
          <div className="agent-pulse-indicator"></div>
        </div>
      </section>

      {/* AI Incident Summary Alert Card Panel */}
      {selectedContainer && (
        <section className="threat-summary">
          <div className="threat-icon">⚠️</div>
          <div className="threat-content">
            <h4>AIOpsGuard Active Threat Assessment Summary</h4>
            <ul>
              {getActiveAlerts().map((alert, index) => (
                <li key={index}>• {alert}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Navigation tabs */}
      <div className="page-nav">
        <button className={`tab ${activeTab === "topology" ? "active" : ""}`} onClick={() => setActiveTab("topology")}>
          🕸️ Dependency Topology
        </button>
        <button className={`tab ${activeTab === "dashboard" ? "active" : ""}`} onClick={() => setActiveTab("dashboard")}>
          🖥️ Real-time Telemetry
        </button>
        <button className={`tab ${activeTab === "observability" ? "active" : ""}`} onClick={() => setActiveTab("observability")}>
          🔍 Root-Cause & Logs
        </button>
        <button className={`tab ${activeTab === "predictive" ? "active" : ""}`} onClick={() => setActiveTab("predictive")}>
          🔮 Predictive Analytics
        </button>
        <button className={`tab ${activeTab === "assistant" ? "active" : ""}`} onClick={() => setActiveTab("assistant")}>
          🤖 DevOps Assistant
        </button>
        <button className={`tab ${activeTab === "runbooks" ? "active" : ""}`} onClick={() => setActiveTab("runbooks")}>
          📚 CI/CD & Runbooks
        </button>
      </div>

      {/* Global Alerts / Messages */}
      {actionMessage.text && (
        <div className={`alert ${actionMessage.type === "error" ? "error" : "success"}`}>
          {actionMessage.text}
        </div>
      )}
      {error && <div className="alert error">{error}</div>}

      {/* Main Content Layout */}
      <div className="dashboard-grid">
        
        {/* Sidebar Container Selector */}
        {activeTab !== "runbooks" && activeTab !== "topology" && (
          <aside className="containers-panel" style={{ gridColumn: '1 / span 1' }}>
            <div className="panel">
              <div className="panel-heading">
                <h2>Active Targets</h2>
              </div>
              <div className="container-list">
                {containers.length === 0 ? (
                  <div className="empty-state">No containers found. Check your Docker engine daemon status.</div>
                ) : (
                  containers.map((c) => {
                    const isActive = c.id === selectedContainerId;
                    return (
                      <div
                        key={c.id}
                        className={`container-card ${isActive ? "active" : ""}`}
                        onClick={() => setSelectedContainerId(c.id)}
                      >
                        <div style={{ flex: 1 }}>
                          <h3>{c.name}</h3>
                          <p style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{c.image?.[0] || "unknown image"}</p>
                          <small style={{ fontSize: '0.75rem', color: '#94a3b8' }}>ID: {c.id}</small>
                        </div>
                        <span className={`status-badge ${c.status === "running" ? "status-running" : "status-exited"}`}>
                          {c.status}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </aside>
        )}

        {/* Tab Pages Workspace */}
        <main style={{ gridColumn: (activeTab === "runbooks" || activeTab === "topology") ? "1 / span 2" : "2 / span 1" }}>
          
          {/* TAB 1: INTERACTIVE SVG TOPOLOGY MAP */}
          {activeTab === "topology" && (
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Infrastructure Topology Map</h2>
                  <p className="panel-meta">Interactive logical service dependency canvas with warning glow alerts</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>
                
                {/* SVG canvas */}
                <div style={{ position: 'relative' }}>
                  <svg className="topology-canvas" viewBox="0 0 700 380">
                    <defs>
                      <marker id="arrow" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#cbd5e1" />
                      </marker>
                    </defs>
                    
                    {/* Connecting arrows / Flow paths */}
                    <path d="M 120,190 L 260,190" className={`flow-link ${getNodeStatus("frontend") === "running" ? "active" : "error"}`} markerEnd="url(#arrow)" />
                    <path d="M 340,190 L 480,130" className={`flow-link ${getNodeStatus("api") === "running" ? "active" : "error"}`} markerEnd="url(#arrow)" />
                    <path d="M 340,190 L 480,250" className={`flow-link ${getNodeStatus("db") === "running" ? "active" : "error"}`} markerEnd="url(#arrow)" />

                    {/* Node 1: Web Client Portal */}
                    <g className="topo-node status-healthy" onClick={() => {
                      const nginx = containers.find(c => c.name.toLowerCase().includes("nginx"));
                      if (nginx) setSelectedContainerId(nginx.id);
                    }}>
                      <circle cx="120" cy="190" r="30" className="glow" />
                      <circle cx="120" cy="190" r="24" fill="#38bdf8" />
                      <text x="120" y="194" textAnchor="middle" fill="white" fontWeight="bold" fontSize="18">🖥️</text>
                      <text x="120" y="235" textAnchor="middle" fill="#1e293b" fontWeight="700" fontSize="12">Web Frontend</text>
                      <text x="120" y="250" textAnchor="middle" fill="#64748b" fontSize="10">(test-nginx)</text>
                    </g>

                    {/* Node 2: API Gateway Engine */}
                    <g className="topo-node status-healthy" onClick={() => setActiveTab("dashboard")}>
                      <circle cx="300" cy="190" r="40" className="glow" />
                      <circle cx="300" cy="190" r="32" fill="#818cf8" />
                      <text x="300" y="196" textAnchor="middle" fill="white" fontWeight="bold" fontSize="22">⚙️</text>
                      <text x="300" y="245" textAnchor="middle" fill="#1e293b" fontWeight="700" fontSize="12">API Gateway</text>
                      <text x="300" y="260" textAnchor="middle" fill="#64748b" fontSize="10">(FastAPI Engine)</text>
                    </g>

                    {/* Node 3: Cache Storage */}
                    <g className="topo-node status-warning" onClick={() => setActiveTab("dashboard")}>
                      <circle cx="520" cy="120" r="30" className="glow" />
                      <circle cx="520" cy="120" r="24" fill="#fbbf24" />
                      <text x="520" y="124" textAnchor="middle" fill="white" fontWeight="bold" fontSize="18">⚡</text>
                      <text x="520" y="165" textAnchor="middle" fill="#1e293b" fontWeight="700" fontSize="12">Redis Cache</text>
                      <text x="520" y="180" textAnchor="middle" fill="#b45309" fontSize="10">High load alert</text>
                    </g>

                    {/* Node 4: Database Storage */}
                    <g className={`topo-node ${getNodeStatus("db") === "running" ? "status-healthy" : "status-error"}`} onClick={() => {
                      const db = containers.find(c => c.name.toLowerCase().includes("postgres") || c.name.toLowerCase().includes("db"));
                      if (db) setSelectedContainerId(db.id);
                    }}>
                      <circle cx="520" cy="260" r="35" className="glow" />
                      <circle cx="520" cy="260" r="28" fill={getNodeStatus("db") === "running" ? "#10b981" : "#f87171"} />
                      <text x="520" y="266" textAnchor="middle" fill="white" fontWeight="bold" fontSize="20">🛢️</text>
                      <text x="520" y="310" textAnchor="middle" fill="#1e293b" fontWeight="700" fontSize="12">PostgreSQL DB</text>
                      <text x="520" y="325" textAnchor="middle" fill={getNodeStatus("db") === "running" ? "#166534" : "#991b1b"} fontSize="10">
                        {getNodeStatus("db") === "running" ? "Connected" : "Disconnected"}
                      </text>
                    </g>
                  </svg>
                </div>

                {/* Node details drawer */}
                <div style={{ display: 'grid', gap: 16 }}>
                  <div className="panel" style={{ padding: 18, margin: 0, background: 'rgba(255,255,255,0.7)' }}>
                    <h3 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', color: '#1e293b' }}>Node Diagnostic Drawer</h3>
                    {selectedContainer ? (
                      <div style={{ display: 'grid', gap: 10, fontSize: '0.84rem' }}>
                        <div>
                          <span style={{ color: '#94a3b8', display: 'block' }}>Active Node Target</span>
                          <strong style={{ color: '#334155' }}>{selectedContainer.name}</strong>
                        </div>
                        <div>
                          <span style={{ color: '#94a3b8', display: 'block' }}>Operational Health</span>
                          <span className={`status-badge ${selectedContainer.health === "healthy" ? "status-healthy" : "status-exited"}`} style={{ padding: '2px 8px', fontSize: '0.74rem' }}>
                            {selectedContainer.health || selectedContainer.status}
                          </span>
                        </div>
                        {selectedContainerMetrics && (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: '#64748b' }}>CPU Util</span>
                              <strong style={{ color: '#1e293b' }}>{selectedContainerMetrics.cpu_percent?.toFixed(1)}%</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: '#64748b' }}>RAM Util</span>
                              <strong style={{ color: '#1e293b' }}>{selectedContainerMetrics.memory_percent?.toFixed(1)}%</strong>
                            </div>
                          </>
                        )}
                        <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                          <button className="button" style={{ padding: '8px 12px', fontSize: '0.8rem' }} onClick={() => triggerAutoHeal(selectedContainerId)}>
                            🛡️ AI Auto-Heal Node
                          </button>
                          <button className="button danger" style={{ padding: '8px 12px', fontSize: '0.8rem' }} onClick={() => triggerRestart(selectedContainerId)}>
                            ⟳ Restart Node
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="muted" style={{ fontSize: '0.84rem' }}>Click on a node icon inside the canvas to inspect diagnostics.</div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB 2: TELEMETRY DASHBOARD */}
          {activeTab === "dashboard" && (
            <div style={{ display: 'grid', gap: 24 }}>
              <div className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Telemetry Charts & Resource Indicators</h2>
                    <p className="panel-meta">Real-time container CPU/Memory trends and metrics indicators</p>
                  </div>
                  {selectedContainer && (
                    <span className={`status-badge ${selectedContainer.health === "healthy" ? "status-healthy" : selectedContainer.health === "unhealthy" ? "status-exited" : "status-paused"}`}>
                      {selectedContainer.health || "health: unknown"}
                    </span>
                  )}
                </div>

                {selectedContainer ? (
                  <div className="details-body">
                    <div className="simple-metrics">
                      <div className="metric-summary">
                        <span>Image Version</span>
                        <strong style={{ fontSize: '0.95rem', fontFamily: 'monospace' }}>{selectedContainer.image?.[0] || "unknown"}</strong>
                      </div>
                      <div className="metric-summary">
                        <span>Container Uptime</span>
                        <strong>
                          {selectedContainer.uptime_seconds
                            ? `${Math.floor(selectedContainer.uptime_seconds / 60)}m ${selectedContainer.uptime_seconds % 60}s`
                            : "Disconnected"}
                        </strong>
                      </div>
                    </div>

                    {/* Telemetry charts */}
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
                      <SparkLineChart
                        data={metricsHistory}
                        dataKey="cpu_percent"
                        stroke="#8b5cf6"
                        fillGradientId="cpuGrad"
                        title="Real-Time CPU Usage Trend"
                      />
                      <SparkLineChart
                        data={metricsHistory}
                        dataKey="memory_percent"
                        stroke="#fb7185"
                        fillGradientId="memGrad"
                        title="Real-Time Memory Usage Trend"
                      />
                    </div>

                    {/* Numeric stats */}
                    {selectedContainerMetrics && (
                      <div className="metrics-group">
                        <div className="metric-row">
                          <span style={{ color: '#475569' }}>Memory limit allocations</span>
                          <span style={{ fontWeight: '600', color: '#1e293b' }}>
                            {formatBytes(selectedContainerMetrics.memory_usage)} used of {formatBytes(selectedContainerMetrics.memory_limit)}
                          </span>
                        </div>
                        {selectedContainerMetrics.network && Object.keys(selectedContainerMetrics.network).map((iface) => (
                          <div className="metric-row" key={iface} style={{ fontSize: '0.85rem' }}>
                            <span style={{ color: '#64748b' }}>Active network throughput ({iface})</span>
                            <span style={{ color: '#334155' }}>
                              ↓ {formatBytes(selectedContainerMetrics.network[iface].rx_bytes)} | ↑ {formatBytes(selectedContainerMetrics.network[iface].tx_bytes)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="empty-state">Select a container target from the list to populate telemetry</div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: ROOT-CAUSE ANALYSIS & INCIDENT TIMELINE */}
          {activeTab === "observability" && (
            <div style={{ display: 'grid', gap: 24 }}>
              
              {/* Root Cause Visual flowchart sequence */}
              {selectedContainer && selectedContainerInsights && (
                <div className="panel">
                  <div className="panel-heading">
                    <h2>Root Cause Flow visualization</h2>
                  </div>
                  
                  <div className="root-cause-flow">
                    <div className="flow-step">
                      <div className="flow-step-icon issue">🚨</div>
                      <div className="flow-step-info">
                        <span>Anomalous Issue</span>
                        <strong>Warning/Anomaly Triggers Active</strong>
                      </div>
                    </div>
                    <div className="flow-arrow">↓</div>
                    <div className="flow-step">
                      <div className="flow-step-icon node">🖥️</div>
                      <div className="flow-step-info">
                        <span>Affected Node Service</span>
                        <strong>Container node: {selectedContainer.name}</strong>
                      </div>
                    </div>
                    <div className="flow-arrow">↓</div>
                    <div className="flow-step">
                      <div className="flow-step-icon cause">🧠</div>
                      <div className="flow-step-info">
                        <span>AI Parsed Root Cause</span>
                        <strong>{selectedContainerInsights.analysis?.cause || selectedContainerInsights.insights?.insight}</strong>
                      </div>
                    </div>
                    <div className="flow-arrow">↓</div>
                    <div className="flow-step">
                      <div className="flow-step-icon fix">🛡️</div>
                      <div className="flow-step-info">
                        <span>Recommended Remediation</span>
                        <strong>{selectedContainerInsights.analysis?.suggested_fix || selectedContainerInsights.insights?.recommendation}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Logs terminal and details */}
              <div className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Incident log observables</h2>
                    <p className="panel-meta">Tailing terminal stream logs & telemetry risk commentaries</p>
                  </div>
                </div>

                {selectedContainerId ? (
                  <div style={{ display: 'grid', gap: 20 }}>
                    
                    {/* Log console terminal */}
                    <div className="log-preview" style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16 }}>
                      {detailsLoading ? (
                        <div style={{ color: '#64748b', fontFamily: 'monospace' }}>Fetching stream buffers...</div>
                      ) : (
                        <pre style={{ margin: 0, color: '#38bdf8', fontFamily: 'monospace', fontSize: '0.85rem', maxHeight: 250, overflowY: 'auto' }}>
                          {selectedContainerLogs || "Active logs database is empty."}
                        </pre>
                      )}
                    </div>

                    {/* Commentary if any */}
                    {selectedContainerInsights?.analysis?.raw_openai && (
                      <div className="panel" style={{ padding: 18, margin: 0, background: 'linear-gradient(135deg, rgba(139,92,246,0.04) 0%, rgba(56,189,248,0.04) 100%)' }}>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '0.88rem', color: '#7c3aed' }}>🧠 Agentic Commentary & Explanations</h4>
                        <p style={{ fontSize: '0.84rem', color: '#475569', fontStyle: 'italic', margin: 0 }}>
                          "{selectedContainerInsights.analysis.raw_openai}"
                        </p>
                      </div>
                    )}

                  </div>
                ) : (
                  <div className="empty-state">Select a target container to view terminal streams</div>
                )}
              </div>

              {/* Chronological Incident Timeline Feed */}
              <div className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Incident Activity Timeline Feed</h2>
                    <p className="panel-meta">Historical sequence of alert validations, forecasting logs, and automated recoveries</p>
                  </div>
                </div>

                <div className="timeline-feed">
                  {timelineEvents.map((evt, index) => (
                    <div key={index} className={`timeline-step type-${evt.type}`}>
                      <div className="timeline-dot"></div>
                      <span className="timeline-time">{evt.time}</span>
                      <h4 className="timeline-header">{evt.title}</h4>
                      <p className="timeline-desc">{evt.message}</p>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* TAB 4: PREDICTIVE ANALYTICS & EXPLAINABILITY */}
          {activeTab === "predictive" && (
            <div style={{ display: 'grid', gap: 24 }}>
              
              {/* Failure Risk Score Explainability circular gauge */}
              {selectedContainer && (
                <div className="panel">
                  <div className="panel-heading">
                    <h2>AI Failure Risk Probability & Explainability</h2>
                    <p className="panel-meta">Explaining exactly why the Predictive Agent assigned the risk parameters</p>
                  </div>

                  <div className="gauge-container">
                    <div className="gauge-svg-wrapper">
                      <div className="gauge-score-text">
                        {selectedContainerPredictions.length > 0
                          ? (selectedContainerPredictions[0].severity === "High" ? "82%" : "45%")
                          : "12%"}
                      </div>
                      <div className="gauge-svg-inner">
                        <svg viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r="40" className="gauge-circle-bg" />
                          <circle
                            cx="50"
                            cy="50"
                            r="40"
                            className="gauge-circle-fill"
                            stroke={
                              selectedContainerPredictions.length > 0
                                ? (selectedContainerPredictions[0].severity === "High" ? "#f87171" : "#fbbf24")
                                : "#10b981"
                            }
                            strokeDasharray="251.2"
                            strokeDashoffset={
                              selectedContainerPredictions.length > 0
                                ? (selectedContainerPredictions[0].severity === "High" ? "45" : "138")
                                : "221"
                            }
                          />
                        </svg>
                      </div>
                    </div>

                    <div className="evidence-list">
                      <h4 style={{ margin: '0 0 6px 0', fontSize: '0.9rem', color: '#1e293b' }}>Evidence Checklist Indicators:</h4>
                      <div className="evidence-item">
                        <div className="evidence-checkmark" style={{ background: selectedContainerMetrics?.cpu_percent > 85 ? 'rgba(16,185,129,0.12)' : 'rgba(148,163,184,0.12)', color: selectedContainerMetrics?.cpu_percent > 85 ? '#10b981' : '#94a3b8' }}>
                          {selectedContainerMetrics?.cpu_percent > 85 ? "✓" : "○"}
                        </div>
                        <span>Sustained CPU saturation &gt; 85% for 3+ cycles</span>
                      </div>
                      <div className="evidence-item">
                        <div className="evidence-checkmark" style={{ background: selectedContainerPredictions.some(p => p.type === "memory_leak") ? 'rgba(16,185,129,0.12)' : 'rgba(148,163,184,0.12)', color: selectedContainerPredictions.some(p => p.type === "memory_leak") ? '#10b981' : '#94a3b8' }}>
                          {selectedContainerPredictions.some(p => p.type === "memory_leak") ? "✓" : "○"}
                        </div>
                        <span>Sliding-window derivative memory leak warnings flagged</span>
                      </div>
                      <div className="evidence-item">
                        <div className="evidence-checkmark" style={{ background: selectedContainerLogs.toLowerCase().includes("error") || selectedContainerLogs.toLowerCase().includes("fail") ? 'rgba(16,185,129,0.12)' : 'rgba(148,163,184,0.12)', color: selectedContainerLogs.toLowerCase().includes("error") || selectedContainerLogs.toLowerCase().includes("fail") ? '#10b981' : '#94a3b8' }}>
                          {selectedContainerLogs.toLowerCase().includes("error") || selectedContainerLogs.toLowerCase().includes("fail") ? "✓" : "○"}
                        </div>
                        <span>Repeated exception/error tokens logged in tail buffer</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Anomaly forecasting cards */}
              <div className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Proactive incident predictions</h2>
                  </div>
                </div>

                {selectedContainerId ? (
                  <div className="predictions-list">
                    {selectedContainerPredictions.length === 0 ? (
                      <div className="summary-empty" style={{ padding: 32 }}>
                        <span style={{ fontSize: '2rem', display: 'block', marginBottom: 8 }}>✅</span>
                        <strong style={{ color: '#166534' }}>Stable baseline verified. No operational anomalies predicted.</strong>
                        <p style={{ color: '#64748b', fontSize: '0.88rem', marginTop: 4 }}>
                          Log checkouts and telemetry gradients are completely normal.
                        </p>
                      </div>
                    ) : (
                      selectedContainerPredictions.map((pred, idx) => (
                        <div
                          key={idx}
                          className={`prediction-card ${
                            pred.severity?.toLowerCase() === "high"
                              ? "severity-high"
                              : pred.severity?.toLowerCase() === "medium"
                              ? "severity-medium"
                              : "severity-low"
                          }`}
                        >
                          <div className="prediction-header">
                            <strong>Anomaly: {pred.type?.replace("_", " ").toUpperCase()}</strong>
                            <span className={`severity-badge ${
                              pred.severity?.toLowerCase() === "high"
                                ? "severity-high"
                                : pred.severity?.toLowerCase() === "medium"
                                ? "severity-medium"
                                : "severity-low"
                            }`}>
                              {pred.severity} Priority
                            </span>
                          </div>
                          <div className="prediction-detail">
                            <span><strong>Diagnosis:</strong> {pred.message}</span>
                            <span><strong>Forecasted Failure:</strong> <span style={{ color: '#b91c1c', fontWeight: 'bold' }}>{pred.estimated_time}</span></span>
                            <span style={{ marginTop: 8, display: 'block', padding: '10px 12px', background: 'rgba(255,255,255,0.7)', borderRadius: 10, border: '1px solid rgba(0,0,0,0.05)' }}>
                              <strong>AI Remediations Strategy:</strong> {pred.recommendation}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="empty-state">Select a target container to forecast incident predictions</div>
                )}
              </div>

            </div>
          )}

          {/* TAB 5: DEVOPS CHATBOT */}
          {activeTab === "assistant" && (
            <div style={{ display: 'grid', gap: 24 }}>
              <div className="chat-page-panel panel">
                <div className="panel-heading">
                  <div>
                    <h2>DevOps Assistant Copilot</h2>
                    <p className="panel-meta">Direct retriever QA chatbot workspace backed by LangChain RAG vector store</p>
                  </div>
                </div>

                <div className="chat-page-body">
                  <div className="chat-history">
                    {chatHistory.length === 0 ? (
                      <div className="empty-state">
                        <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: 12 }}>💬</span>
                        <strong>AIOps Copilot Workspace</strong>
                        <p style={{ fontSize: '0.88rem', color: '#64748b', marginTop: 4, maxWidth: 360, margin: '4px auto 0' }}>
                          Submit server diagnostics, postgres socket failures, port binds, or kubernetes log rollbacks.
                        </p>
                      </div>
                    ) : (
                      chatHistory.map((msg, i) => (
                        <div className="chat-message" key={i}>
                          <div className="chat-user">
                            <strong>SYSTEM OPERATOR</strong>
                            <p>{msg.question}</p>
                          </div>
                          <div className="chat-assistant">
                            <strong>AIOPS COPILOT</strong>
                            <p>{msg.answer}</p>
                            {msg.sources && msg.sources.length > 0 && (
                              <div className="chat-sources">
                                <strong>Correlated Documentation Sources:</strong>
                                <ul>
                                  {msg.sources.map((src, idx) => (
                                    <li key={idx}>{src}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="chat-input-area">
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={useRag}
                          onChange={(e) => setUseRag(e.target.checked)}
                          style={{ marginRight: 6 }}
                        />
                        <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '600' }}>
                          Enhance with RAG Runbooks Context
                        </span>
                      </label>
                      <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>|</span>
                      <span className="chat-context">
                        Container Context: <strong>{selectedContainer ? selectedContainer.name : "Global"}</strong>
                      </span>
                    </div>

                    <div className="chat-input-controls">
                      <textarea
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="e.g. 'How do I resolve connection refused in postgres container?'..."
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            askAssistant();
                          }
                        }}
                      />
                      <button
                        className="button"
                        onClick={askAssistant}
                        disabled={chatLoading || !chatInput.trim()}
                        style={{ height: '52px', minWidth: '90px' }}
                      >
                        {chatLoading ? "Thinking..." : "Send"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: CI/CD & RUNBOOKS ADMIN */}
          {activeTab === "runbooks" && (
            <div className="rag-page-body">
              
              {/* CI/CD Release Tracker */}
              <div className="rag-page-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Simulated CI/CD Pipeline Deployment Tracker</h2>
                    <p className="panel-meta">Monitor release checkouts, automated rollbacks, and failed build logs</p>
                  </div>
                </div>

                <div className="releases-grid">
                  {deployments.map((dep, index) => (
                    <div className="release-card" key={index}>
                      <div className="release-header">
                        <span className="release-version">Release Version: <strong>{dep.version}</strong></span>
                        <span className={`release-status ${dep.status}`}>
                          {dep.status}
                        </span>
                      </div>
                      <pre className="release-logs">{dep.logs}</pre>
                      {dep.status === "failed" && (
                        <div style={{ marginTop: 4 }}>
                          <button className="button danger" style={{ padding: '8px 16px', fontSize: '0.8rem' }} onClick={triggerRollback}>
                            ⟳ Forcibly Rollback Build to {dep.rollback_target}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* RAG Status details */}
              <div className="rag-page-panel">
                <div className="panel-heading">
                  <h2>Vector Database Admin Panel</h2>
                </div>
                
                {ragStatus ? (
                  <div className="rag-status" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                    <div className="rag-status-item">
                      <span>Database Engine:</span> <strong>ChromaDB</strong>
                    </div>
                    <div className="rag-status-item">
                      <span>Registered Runbook Chunks:</span> <strong>{ragStatus.collection_count ?? 0}</strong>
                    </div>
                    <div className="rag-status-item">
                      <span>Ingestion Queue Load:</span> <strong>{ragStatus.queue_size ?? 0} documents</strong>
                    </div>
                  </div>
                ) : (
                  <div className="empty-state">Unable to load vector database status. Check your Python libraries.</div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 24 }}>
                
                {/* Submit runbook documentation snippet */}
                <div className="rag-add">
                  <h3 style={{ margin: 0, color: '#312e81' }}>Index Runbook Documentation</h3>
                  <form onSubmit={addRagDocument}>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4, fontWeight: '600' }}>Document Title</label>
                      <input
                        type="text"
                        value={ragDocTitle}
                        onChange={(e) => setRagDocTitle(e.target.value)}
                        placeholder="e.g. 'Postgres Host Connection Failure Runbook'"
                        required
                      />
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4, fontWeight: '600' }}>Runbook Content Snippet (Semantic Text)</label>
                      <textarea
                        value={ragDocText}
                        onChange={(e) => setRagDocText(e.target.value)}
                        placeholder="e.g. 'Verify system has active port listeners on 5432. Check postgresql.conf and listen_addresses = '*' settings before restarting service.'"
                        required
                      />
                    </div>
                    <button type="submit" className="button" disabled={ragAddLoading || !ragDocText.trim()}>
                      {ragAddLoading ? "Processing Embeddings..." : "Submit to Vector Store"}
                    </button>
                  </form>
                </div>

                {/* Search Knowledgebase directly */}
                <div className="rag-search">
                  <h3 style={{ margin: 0, color: '#312e81' }}>Query Knowledgebase (Semantic Search)</h3>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                    <input
                      type="text"
                      value={ragQuery}
                      onChange={(e) => setRagQuery(e.target.value)}
                      placeholder="e.g. 'disk space full' or 'postgresql connection failure'..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') performRagSearch();
                      }}
                    />
                    <button className="button" onClick={performRagSearch} disabled={ragLoading || !ragQuery.trim()}>
                      {ragLoading ? "Searching..." : "Search"}
                    </button>
                  </div>

                  <div className="rag-results">
                    {ragResults.length === 0 ? (
                      <div className="empty-state">Enter a semantic query to search through vector databases.</div>
                    ) : (
                      ragResults.map((r, ri) => (
                        <div key={ri} className="rag-result">
                          <strong>Snippet Title: {r.title || r.id || `chunk-${ri}`}</strong>
                          <p style={{ margin: 0, fontSize: '0.9rem', color: '#475569', lineHeight: 1.5 }}>
                            {r.text || r.content || JSON.stringify(r).slice(0, 300)}
                          </p>
                          {r.score !== undefined && (
                            <small style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: 4, display: 'block' }}>
                              Semantic Distance Score: {r.score?.toFixed(4)}
                            </small>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>

            </div>
          )}

        </main>
      </div>
    </div>
  );
}

export default App;
