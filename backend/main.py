from fastapi import FastAPI
from pydantic import BaseModel

from docker_monitor import (
    get_containers,
    restart_container,
    get_container_logs
)

from ai_engine import analyze_logs

app = FastAPI()


class LogRequest(BaseModel):
    logs: str


@app.get("/")
def home():

    return {
        "message": "AIOpsGuard Running"
    }


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


@app.post("/analyze-log")
def analyze(request: LogRequest):

    result = analyze_logs(request.logs)

    return {
        "analysis": result
    }