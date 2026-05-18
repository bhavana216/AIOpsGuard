import docker

client = docker.from_env()


def get_containers():

    containers = client.containers.list(all=True)

    data = []

    for container in containers:

        data.append({
            "id": container.short_id,
            "name": container.name,
            "status": container.status,
            "image": container.image.tags
        })

    return data


def restart_container(container_id):

    container = client.containers.get(container_id)

    container.restart()

    return {
        "message": f"Container {container.name} restarted successfully"
    }


def get_container_logs(container_id):

    container = client.containers.get(container_id)

    logs = container.logs(tail=50).decode("utf-8")

    return logs