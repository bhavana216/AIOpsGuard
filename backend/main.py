from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psutil

from docker_monitor import (
    get_containers,
    restart_container,
    get_container_logs,
    get_container_metrics,
    auto_heal_container,
)

from ai_engine import analyze_logs, generate_insights
from incident_predictor import predict_incidents
from devops_assistant import ask_devops_assistant, get_conversation_history, initialize_assistant
import rag


class RagDoc(BaseModel):
    id: str
    title: str | None = None
    text: str


class RagAddRequest(BaseModel):
    docs: list[RagDoc]


class RagSearchRequest(BaseModel):
    query: str
    k: int = 3


class ChatRequest(BaseModel):
    question: str
    container_id: str | None = None
    logs: str | None = None

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LogRequest(BaseModel):
    logs: str


@app.get("/")
def home():
    return {
        "message": "AIOpsGuard Running"
    }


@app.get("/system/metrics")
def system_metrics():
    try:
        cpu_percent = psutil.cpu_percent(interval=None)
        mem = psutil.virtual_memory()
        memory_stats = {
            "total": mem.total,
            "available": mem.available,
            "used": mem.used,
            "percent": mem.percent
        }
        
        disk = psutil.disk_usage('/')
        disk_stats = {
            "total": disk.total,
            "used": disk.used,
            "free": disk.free,
            "percent": disk.percent
        }
        
        net = psutil.net_io_counters()
        network_stats = {
            "bytes_sent": net.bytes_sent,
            "bytes_recv": net.bytes_recv
        }
        
        import docker
        try:
            client = docker.from_env()
            containers = client.containers.list(all=True)
            total = len(containers)
            running = sum(1 for c in containers if c.status == "running")
            paused = sum(1 for c in containers if c.status == "paused")
            stopped = total - running - paused
            
            unhealthy = 0
            for c in containers:
                state = c.attrs.get("State", {})
                health = state.get("Health", {})
                if health and health.get("Status") == "unhealthy":
                    unhealthy += 1
                    
            docker_stats = {
                "total": total,
                "running": running,
                "paused": paused,
                "stopped": stopped,
                "unhealthy": unhealthy
            }
        except Exception:
            docker_stats = {
                "total": 0,
                "running": 0,
                "paused": 0,
                "stopped": 0,
                "unhealthy": 0,
                "error": "Docker daemon not running"
            }
            
        return {
            "cpu_percent": cpu_percent,
            "memory": memory_stats,
            "disk": disk_stats,
            "network": network_stats,
            "docker": docker_stats
        }
    except Exception as e:
        return {"error": str(e)}


@app.on_event("startup")
def startup_event():
    try:
        rag.start()
    except Exception:
        # If RAG can't start (missing deps or config), continue without it
        pass
    
    try:
        initialize_assistant()
    except Exception:
        # If DevOps Assistant can't initialize, continue without it
        pass


@app.post("/rag/add")
def rag_add(request: RagAddRequest):
    try:
        rag.add_documents([d.dict() for d in request.docs])
        return {"status": "queued", "count": len(request.docs)}
    except Exception as e:
        return {"error": str(e)}


@app.post("/rag/search")
def rag_search(request: RagSearchRequest):
    try:
        results = rag.search(request.query, k=request.k)
        return {"results": results}
    except Exception as e:
        return {"error": str(e), "results": []}


@app.get("/rag/status")
def rag_status():
    try:
        return rag.get_status()
    except Exception as e:
        return {"error": str(e)}


@app.get("/containers")
def containers():
    return get_containers()


@app.post("/restart/{container_id}")
def restart(container_id: str):
    return restart_container(container_id)


@app.get("/logs/{container_id}")
def logs(container_id: str):
    return {
        "logs": get_container_logs(container_id)
    }


@app.get("/metrics/{container_id}")
def metrics(container_id: str):
    return get_container_metrics(container_id)


@app.post("/heal/{container_id}")
def heal(container_id: str):
    return auto_heal_container(container_id)


@app.get("/insights/{container_id}")
def insights(container_id: str):
    logs = get_container_logs(container_id)
    metrics = get_container_metrics(container_id)

    return {
        "analysis": analyze_logs(logs, metrics),
        "insights": generate_insights(logs, metrics),
        "logs_preview": logs[:1500],
    }


@app.post("/analyze-log")
def analyze(request: LogRequest):
    result = analyze_logs(request.logs)
    return {
        "analysis": result
    }


@app.get("/predict/{container_id}")
def predict(container_id: str):
    """Predict potential incidents for a container based on metric trends."""
    try:
        logs = get_container_logs(container_id)
        metrics = get_container_metrics(container_id)
        predictions = predict_incidents(container_id, metrics, logs)
        return {
            "predictions": predictions,
            "container_id": container_id,
        }
    except Exception as e:
        return {
            "predictions": [],
            "error": str(e)
        }


@app.post("/chat")
def chat(request: ChatRequest):
    """Ask the AI DevOps Assistant a question."""
    try:
        logs = ""
        if request.container_id:
            logs = get_container_logs(request.container_id)
        
        result = ask_devops_assistant(
            question=request.question,
            container_id=request.container_id,
            logs=logs if request.logs is None else request.logs,
        )
        return result
    except Exception as e:
        return {
            "status": "error",
            "answer": f"Error: {str(e)}",
        }


@app.get("/chat/history/{container_id}")
def chat_history(container_id: str | None = None):
    """Get conversation history for a container."""
    try:
        history = get_conversation_history(container_id)
        return {
            "history": history,
            "count": len(history),
        }
    except Exception as e:
        return {
            "error": str(e),
            "history": [],
        }


# Simulated CI/CD databases and chronological event log
deployments_db = [
    {
        "id": "release-24.1.0",
        "timestamp": "2026-05-27T12:00:00Z",
        "version": "v2.4.1",
        "status": "success",
        "logs": "Vite production bundle compiled. Docker socket bind verified. Service port mapping 8080:80 healthy.",
        "rollback_target": None
    },
    {
        "id": "release-24.2.0",
        "timestamp": "2026-05-27T18:30:00Z",
        "version": "v2.4.2",
        "status": "failed",
        "logs": "Fatal build: critical memory overflow (OOM) detected at auth-service container bootstrap.",
        "rollback_target": "release-24.1.0"
    }
]

timeline_events = [
    {"time": "12:03 PM", "type": "metric", "title": "Host CPU Spike", "message": "Host CPU usage exceeded 90% threshold for 2 consecutive cycles."},
    {"time": "12:07 PM", "type": "prediction", "title": "Memory Anomaly Forecasted", "message": "Prediction Agent flagged auth-service memory slope derivative (+4.2%/min). Imminent crash predicted in 14 mins."},
    {"time": "12:10 PM", "type": "healing", "title": "Self-Healing Triggered", "message": "Healing Agent detected critical memory crash logs in auth-service container. Auto-heal initiated."},
    {"time": "12:11 PM", "type": "healing", "title": "Container Restored", "message": "auth-service restarted successfully by Healing Agent. System health verified healthy."}
]


@app.get("/deployments")
def get_deployments():
    return {"deployments": deployments_db}


@app.post("/deployments/rollback")
def rollback_deployment():
    global deployments_db, timeline_events
    import time
    from datetime import datetime
    if deployments_db and deployments_db[-1]["status"] == "failed":
        latest = deployments_db.pop()
        rolled_back = {
            "id": f"release-rollback-{int(time.time())}",
            "timestamp": datetime.now().isoformat(),
            "version": "v2.4.1 (Rollback)",
            "status": "success",
            "logs": f"Rollback successfully triggered! Reverted failed build {latest['version']} to clean release {latest['rollback_target']}.",
            "rollback_target": None
        }
        deployments_db.append(rolled_back)
        
        time_str = datetime.now().strftime("%I:%M %p")
        timeline_events.append({
            "time": time_str,
            "type": "deploy",
            "title": "CI/CD Rollback Applied",
            "message": f"Successfully rolled back deployment to stable version v2.4.1. Traffic restored to production."
        })
        
        return {"status": "success", "message": "Successfully rolled back deployment to v2.4.1."}
    return {"status": "info", "message": "No failed deployment requires rollback at this time."}


@app.get("/timeline")
def get_timeline():
    return {"events": timeline_events}
