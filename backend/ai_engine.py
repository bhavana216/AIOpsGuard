def analyze_logs(logs):

    logs = logs.lower()

    if "memory" in logs:

        return {
            "cause": "Memory overflow issue detected.",
            "severity": "High",
            "suggested_fix": "Increase container memory allocation and restart service."
        }

    elif "crash" in logs:

        return {
            "cause": "Container crash detected.",
            "severity": "Medium",
            "suggested_fix": "Restart the container and inspect logs."
        }

    elif "timeout" in logs:

        return {
            "cause": "Network timeout issue detected.",
            "severity": "Medium",
            "suggested_fix": "Check service connectivity and network configuration."
        }

    else:

        return {
            "cause": "Normal container behavior detected.",
            "severity": "Low",
            "suggested_fix": "No action required."
        }