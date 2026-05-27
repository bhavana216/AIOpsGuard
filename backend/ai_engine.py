import os
import re
from dotenv import load_dotenv

try:
    import openai
except ImportError:
    openai = None

load_dotenv()

try:
    from rag import search as rag_search
except Exception:
    rag_search = None

if openai and os.getenv("OPENAI_API_KEY"):
    openai.api_key = os.getenv("OPENAI_API_KEY")

ERROR_PATTERNS = [
    (r"out of memory|oom|memory leak|memory overflow", "Memory overflow issue detected.", "Increase container memory allocation or add swap, reduce memory pressure.", "High"),
    (r"connection refused|connection reset|unable to connect|connect timeout|no route to host", "Network or service connectivity issue detected.", "Verify network configuration, service endpoints, and restart the affected container.", "Medium"),
    (r"task timed out|timeout|request timed out", "Service timeout detected.", "Inspect network latency, increase timeouts, and check service responsiveness.", "Medium"),
    (r"segfault|panic|fatal error|exception|traceback", "Runtime crash or exception detected.", "Review stack traces, fix the underlying application bug, and restart the service.", "High"),
    (r"permission denied|access denied|unauthorized|forbidden", "Permission or access control issue detected.", "Check container permissions, credentials, and environment variables.", "High"),
]


def _clean_logs(logs):
    return re.sub(r"\s+", " ", logs.strip()).lower()


def _guess_severity_from_metrics(metrics):
    if not metrics:
        return None

    if metrics.get("memory_percent", 0) >= 90 or metrics.get("cpu_percent", 0) >= 90:
        return "High"
    if metrics.get("memory_percent", 0) >= 75 or metrics.get("cpu_percent", 0) >= 75:
        return "Medium"
    return "Low"


def _openai_analysis(logs, metrics):
    if not openai or not getattr(openai, "api_key", None):
        return None

    # perform retrieval-augmented generation (RAG) if available
    retrieved = []
    try:
        if rag_search:
            query = logs[:2000] if logs else ""
            retrieved = rag_search(query, k=3)
    except Exception:
        retrieved = []

    prompt = (
        "You are an AI operations assistant. Analyze the provided Docker container logs and metrics. "
        "Return a JSON object with keys: cause, severity, suggested_fix, insight, recommendation. "
        "If the logs indicate no issue, return severity Low and suggest no action.\n\n"
        f"Logs: {logs}\n\n"
        f"Metrics: {metrics}\n"
    )

    if retrieved:
        prompt += "\nRelevant documents and runbook snippets:\n"
        for d in retrieved:
            prompt += f"- {d.get('title','')}: {d.get('text','')[:1000]}\n"

    try:
        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "system", "content": "You are an expert DevOps AI assistant."},
                      {"role": "user", "content": prompt}],
            max_tokens=400,
            temperature=0.2,
        )
        text = response.choices[0].message.content.strip()
        return text
    except Exception:
        return None


def analyze_logs(logs, metrics=None):
    content = _clean_logs(logs)
    cause = "Normal container behavior detected."
    severity = _guess_severity_from_metrics(metrics) or "Low"
    suggested_fix = "No action required. Continue monitoring."

    for pattern, pattern_cause, fix, pattern_severity in ERROR_PATTERNS:
        if re.search(pattern, content):
            cause = pattern_cause
            suggested_fix = fix
            severity = pattern_severity
            break

    if metrics:
        if metrics.get("memory_percent", 0) >= 90:
            cause = "Memory pressure is very high and may lead to instability."
            suggested_fix = "Reduce container memory usage or increase the memory limit."
            severity = "High"
        elif metrics.get("cpu_percent", 0) >= 90:
            cause = "CPU usage is saturated and may impact service responsiveness."
            suggested_fix = "Scale the workload or optimize the service to reduce CPU load."
            severity = "High"
        elif metrics.get("memory_percent", 0) >= 75:
            cause = "Memory utilization is elevated."
            suggested_fix = "Monitor memory growth and consider tuning or increasing the container limit."
            severity = "Medium"

    ai_text = _openai_analysis(logs, metrics)
    if ai_text:
        return {
            "cause": cause,
            "severity": severity,
            "suggested_fix": suggested_fix,
            "raw_openai": ai_text,
        }

    return {
        "cause": cause,
        "severity": severity,
        "suggested_fix": suggested_fix,
    }


def generate_insights(logs, metrics=None):
    content = _clean_logs(logs)
    insight = "System appears stable."
    recommendation = "No immediate action required. Keep monitoring."
    risk_level = "Low"

    if metrics:
        if metrics.get("cpu_percent", 0) >= 90 or metrics.get("memory_percent", 0) >= 90:
            insight = "The container is experiencing resource saturation."
            recommendation = "Review scaling settings and increase CPU/memory allowances if possible."
            risk_level = "High"
        elif metrics.get("cpu_percent", 0) >= 75 or metrics.get("memory_percent", 0) >= 75:
            insight = "Resource usage is trending upward and may require tuning soon."
            recommendation = "Check application load and plan capacity adjustments."
            risk_level = "Medium"

    for pattern, pattern_cause, fix, pattern_severity in ERROR_PATTERNS:
        if re.search(pattern, content):
            insight = f"Detected recurring issue: {pattern_cause.lower()}"
            recommendation = fix
            risk_level = pattern_severity
            break

    if metrics and metrics.get("health") == "unhealthy":
        insight = "Health checks are failing for this container."
        recommendation = "Restart the container and inspect its health probe configuration."
        risk_level = "High"

    return {
        "insight": insight,
        "recommendation": recommendation,
        "risk_level": risk_level,
    }
