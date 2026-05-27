import docker
from datetime import datetime

client = docker.from_env()


def _container_health(container):
    state = container.attrs.get("State", {})
    health = state.get("Health", {})
    return health.get("Status") if health else None


def _container_uptime(container):
    started_at = container.attrs.get("State", {}).get("StartedAt")
    if not started_at:
        return None
    try:
        started = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
        return int((datetime.utcnow() - started).total_seconds())
    except Exception:
        return None


def get_containers():
    try:
        containers = client.containers.list(all=True)
        data = []
        for container in containers:
            data.append({
                "id": container.short_id,
                "name": container.name,
                "status": container.status,
                "image": container.image.tags,
                "health": _container_health(container),
                "uptime_seconds": _container_uptime(container),
                "labels": container.labels,
            })
        return data
    except Exception as e:
        print("Docker get_containers error:", e)
        return []


def get_container_logs(container_id):
    try:
        container = client.containers.get(container_id)
        logs = container.logs(tail=150).decode("utf-8", errors="replace")
        return logs
    except Exception as e:
        return f"Error fetching logs: Docker daemon or container not accessible. Detail: {str(e)}"


def get_container_metrics(container_id):
    try:
        container = client.containers.get(container_id)
        stats = container.stats(stream=False)

        cpu_percent = 0.0
        precpu = stats.get("precpu_stats", {}).get("cpu_usage", {}).get("total_usage", 0)
        cpu = stats.get("cpu_stats", {}).get("cpu_usage", {}).get("total_usage", 0)
        system = stats.get("cpu_stats", {}).get("system_cpu_usage", 0)
        pre_system = stats.get("precpu_stats", {}).get("system_cpu_usage", 0)
        cpu_delta = cpu - precpu
        system_delta = system - pre_system

        if system_delta > 0 and cpu_delta > 0:
            cores = len(stats.get("cpu_stats", {}).get("cpu_usage", {}).get("percpu_usage", [])) or 1
            cpu_percent = round((cpu_delta / system_delta) * cores * 100.0, 2)

        memory = stats.get("memory_stats", {})
        mem_used = memory.get("usage", 0)
        mem_limit = memory.get("limit", 1)
        mem_percent = round((mem_used / mem_limit) * 100.0, 2) if mem_limit else 0

        network = {}
        for iface, traffic in stats.get("networks", {}).items():
            network[iface] = {
                "rx_bytes": traffic.get("rx_bytes", 0),
                "tx_bytes": traffic.get("tx_bytes", 0),
            }

        return {
            "cpu_percent": cpu_percent,
            "memory_usage": mem_used,
            "memory_limit": mem_limit,
            "memory_percent": mem_percent,
            "network": network,
            "health": _container_health(container),
            "status": container.status,
            "uptime_seconds": _container_uptime(container),
        }
    except Exception as e:
        return {
            "cpu_percent": 0.0,
            "memory_usage": 0,
            "memory_limit": 100,
            "memory_percent": 0.0,
            "network": {},
            "health": "unknown",
            "status": "error",
            "uptime_seconds": 0,
            "error": str(e)
        }


def restart_container(container_id):
    try:
        container = client.containers.get(container_id)
        container.restart()
        return {
            "message": f"Container {container.name} restarted successfully"
        }
    except Exception as e:
        return {
            "error": f"Failed to restart container: {str(e)}"
        }


def auto_heal_container(container_id):
    try:
        container = client.containers.get(container_id)
        current_status = container.status
        health = _container_health(container)
        logs = get_container_logs(container_id)
        reason = None
        action = "none"

        if current_status != "running":
            container.restart()
            action = "restarted"
            reason = "Container was not running"
        elif health == "unhealthy":
            container.restart()
            action = "restarted"
            reason = "Container health reported unhealthy"
        elif any(token in logs.lower() for token in ["oom", "out of memory", "fatal", "segfault", "panic", "traceback"]):
            container.restart()
            action = "restarted"
            reason = "Critical error pattern found in logs"

        return {
            "container": {
                "id": container.short_id,
                "name": container.name,
                "status": current_status,
                "health": health,
            },
            "action": action,
            "reason": reason,
            "message": "Auto-heal completed." if action != "none" else "No healing action required.",
        }
    except Exception as e:
        return {
            "action": "none",
            "reason": f"Failed to access or auto-heal container: {str(e)}",
            "message": "Auto-heal failed."
        }
