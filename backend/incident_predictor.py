"""
AI-driven incident prediction engine.
Analyzes metric trends to predict potential failures before they occur.
"""

import math
from collections import defaultdict
from datetime import datetime, timedelta

# Store historical metrics for trend analysis
metrics_history = defaultdict(list)

MAX_HISTORY = 60  # Keep last 60 samples


def record_metrics(container_id, metrics):
    """Record metrics snapshot for trend analysis."""
    snapshot = {
        "timestamp": datetime.now(),
        "cpu_percent": metrics.get("cpu_percent", 0),
        "memory_percent": metrics.get("memory_percent", 0),
    }
    metrics_history[container_id].append(snapshot)
    
    # Keep only recent history
    if len(metrics_history[container_id]) > MAX_HISTORY:
        metrics_history[container_id] = metrics_history[container_id][-MAX_HISTORY:]


def _detect_memory_leak(container_id):
    """Detect if memory usage is steadily increasing (potential leak)."""
    history = metrics_history.get(container_id, [])
    if len(history) < 5:
        return None
    
    # Get last 5 samples
    recent = history[-5:]
    memory_values = [s["memory_percent"] for s in recent]
    
    # Check if memory is consistently increasing
    increasing_count = sum(1 for i in range(1, len(memory_values)) 
                          if memory_values[i] > memory_values[i-1])
    
    if increasing_count >= 4:  # At least 4 consecutive increases
        avg_increase = (memory_values[-1] - memory_values[0]) / 4
        if avg_increase > 2:  # More than 2% increase per interval
            current = memory_values[-1]
            if current < 100:
                minutes_to_critical = (100 - current) / avg_increase * 2  # ~2 min per interval
                return {
                    "type": "memory_leak",
                    "severity": "High",
                    "message": f"Memory leak suspected: {current:.1f}% → {100:.1f}%",
                    "estimated_time": f"{max(1, int(minutes_to_critical))} minute(s)",
                    "recommendation": "Restart container or increase memory limit immediately"
                }
    
    return None


def _detect_cpu_anomaly(container_id):
    """Detect abnormal CPU behavior (spikes or sustained high usage)."""
    history = metrics_history.get(container_id, [])
    if len(history) < 3:
        return None
    
    recent = history[-10:] if len(history) >= 10 else history
    cpu_values = [s["cpu_percent"] for s in recent]
    
    # Detect sudden spike
    if len(cpu_values) >= 2:
        latest = cpu_values[-1]
        previous = sum(cpu_values[:-1]) / len(cpu_values[:-1])
        spike = latest - previous
        
        if spike > 30 and latest > 60:  # Big spike to high usage
            return {
                "type": "cpu_spike",
                "severity": "Medium",
                "message": f"CPU spike detected: {previous:.1f}% → {latest:.1f}%",
                "estimated_time": "Monitor next 5 minutes",
                "recommendation": "Investigate process consuming CPU or optimize application code"
            }
    
    # Detect sustained high CPU
    if len(cpu_values) >= 5:
        avg_cpu = sum(cpu_values[-5:]) / 5
        if avg_cpu > 80:
            return {
                "type": "high_cpu",
                "severity": "Medium",
                "message": f"CPU trend abnormal: sustained {avg_cpu:.1f}% usage",
                "estimated_time": "Ongoing condition",
                "recommendation": "Scale horizontally or optimize application performance"
            }
    
    return None


def _detect_memory_pressure(container_id, current_metrics):
    """Detect if memory is approaching critical levels."""
    memory_percent = current_metrics.get("memory_percent", 0)
    
    if memory_percent > 90:
        return {
            "type": "memory_critical",
            "severity": "High",
            "message": f"Memory critical: {memory_percent:.1f}% usage",
            "estimated_time": "Immediate action needed",
            "recommendation": "Restart container or increase memory allocation"
        }
    elif memory_percent > 80:
        return {
            "type": "memory_pressure",
            "severity": "Medium",
            "message": f"Memory pressure detected: {memory_percent:.1f}% usage",
            "estimated_time": "Monitor closely",
            "recommendation": "Consider increasing memory limit or reducing container workload"
        }
    
    return None


def _detect_crash_risk(container_id, current_metrics, logs=""):
    """Estimate risk of imminent container crash."""
    memory_percent = current_metrics.get("memory_percent", 0)
    cpu_percent = current_metrics.get("cpu_percent", 0)
    
    risk_score = 0
    factors = []
    
    # Memory factors
    if memory_percent > 95:
        risk_score += 40
        factors.append("memory critical")
    elif memory_percent > 85:
        risk_score += 20
        factors.append("high memory")
    
    # CPU factors
    if cpu_percent > 95:
        risk_score += 20
        factors.append("CPU maxed")
    
    # Check for error patterns in logs
    error_keywords = ["oom", "out of memory", "segfault", "panic", "fatal", "crash", "error"]
    recent_errors = sum(1 for keyword in error_keywords if keyword in logs.lower())
    if recent_errors > 0:
        risk_score += 20
        factors.append("error patterns")
    
    if risk_score >= 40:
        minutes = max(1, (100 - memory_percent) // 10) if memory_percent > 50 else "5-10"
        return {
            "type": "crash_risk",
            "severity": "High",
            "message": f"Container may crash soon ({', '.join(factors)})",
            "estimated_time": f"{minutes} minute(s)" if isinstance(minutes, int) else minutes,
            "recommendation": "Restart container immediately and investigate resource usage"
        }
    
    return None


def predict_incidents(container_id, current_metrics, logs=""):
    """
    Predict potential incidents for a container.
    Returns list of predictions sorted by severity.
    """
    predictions = []
    
    # Record current metrics
    record_metrics(container_id, current_metrics)
    
    # Run detection algorithms
    memory_leak = _detect_memory_leak(container_id)
    if memory_leak:
        predictions.append(memory_leak)
    
    cpu_anomaly = _detect_cpu_anomaly(container_id)
    if cpu_anomaly:
        predictions.append(cpu_anomaly)
    
    memory_pressure = _detect_memory_pressure(container_id, current_metrics)
    if memory_pressure:
        predictions.append(memory_pressure)
    
    crash_risk = _detect_crash_risk(container_id, current_metrics, logs)
    if crash_risk:
        predictions.append(crash_risk)
    
    # Sort by severity (High > Medium > Low)
    severity_order = {"High": 0, "Medium": 1, "Low": 2}
    predictions.sort(key=lambda x: severity_order.get(x["severity"], 999))
    
    return predictions


def clear_history(container_id=None):
    """Clear metrics history."""
    if container_id:
        metrics_history.pop(container_id, None)
    else:
        metrics_history.clear()
