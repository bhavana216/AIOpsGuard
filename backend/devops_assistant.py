"""
AI-powered DevOps Assistant chatbot.
Uses LangChain + ChromaDB for RAG-based question answering.
Trained on Docker, Kubernetes, and Linux troubleshooting knowledge.
"""

import os
from typing import Optional, List
from dotenv import load_dotenv

try:
    from langchain_openai import ChatOpenAI, OpenAIEmbeddings
    from langchain_community.vectorstores import Chroma
    from langchain.prompts import PromptTemplate
    from langchain.chains import RetrievalQA
    from langchain_text_splitters import RecursiveCharacterTextSplitter
except ImportError:
    ChatOpenAI = None
    OpenAIEmbeddings = None
    Chroma = None
    RetrievalQA = None
    RecursiveCharacterTextSplitter = None

load_dotenv()

# Default knowledge base for DevOps troubleshooting
DEFAULT_KNOWLEDGE_BASE = """
### Docker Troubleshooting Guide

**Container won't start:**
- Check container logs: `docker logs <container-id>`
- Verify image exists: `docker images`
- Check port conflicts: `netstat -tuln` or `docker port <container-id>`
- Insufficient resources: check memory/CPU limits

**Port conflicts:**
- Find process using port: `netstat -tuln | grep :PORT` (Linux) or `netstat -ano | findstr :PORT` (Windows)
- Kill the process or change container port mapping
- Verify with `docker ps --format "{{.Names}} {{.Ports}}"`

**Image build failures:**
- Check Dockerfile syntax
- Verify base image availability
- Check internet connectivity for package downloads
- Review build logs carefully

**Container unhealthy:**
- Check health status: `docker ps --format "{{.Names}} {{.Status}}"`
- Review healthcheck definition in Dockerfile
- Check container logs for error messages
- Verify service is actually running inside container

**Memory leaks in containers:**
- Monitor memory usage: `docker stats --no-stream <container-id>`
- Check for accumulating zombie processes
- Review application logs for memory allocation errors
- Consider increasing memory limit or restarting container

**CPU usage high:**
- Profile container: `docker stats`
- Check process inside container: `docker exec <container-id> top`
- Look for infinite loops or busy-wait patterns
- Consider horizontal scaling or optimization

### Kubernetes Troubleshooting Guide

**Pod won't start:**
- Check pod status: `kubectl describe pod <pod-name>`
- Review events: `kubectl get events --sort-by='.lastTimestamp'`
- Check resource requests vs available: `kubectl top nodes`
- Verify image pull: `kubectl logs <pod-name> -c <container>`

**Service connectivity issues:**
- Check service endpoints: `kubectl get endpoints <service-name>`
- Verify selector labels: `kubectl get pods -l <label>=<value>`
- Test DNS resolution: `kubectl run -it --image=busybox --rm debug -- nslookup <service>`
- Check network policies: `kubectl get networkpolicies`

**Persistent storage issues:**
- Check PVC status: `kubectl get pvc`
- Verify PV availability: `kubectl get pv`
- Check mount paths in pod
- Review storage class: `kubectl get storageclass`

**Resource limits exceeded:**
- Monitor usage: `kubectl top pods`
- Check limits: `kubectl describe node`
- Update resource requests/limits in deployment
- Consider horizontal pod autoscaling

### Linux Troubleshooting Guide

**Disk space issues:**
- Check usage: `df -h`
- Find large files: `du -sh /* | sort -h`
- Clear logs: `rm /var/log/*.log`
- Clean package cache: `apt clean` or `yum clean all`

**Port conflicts:**
- Find process using port: `lsof -i :<port>` or `netstat -tuln | grep :<port>`
- Kill process: `kill -9 <pid>`
- Check /etc/services for standard ports

**Permission denied errors:**
- Check file permissions: `ls -la <file>`
- Change permissions: `chmod <mode> <file>`
- Change ownership: `chown <user>:<group> <file>`
- Check SELinux: `getenforce` and `setenforce`

**Network connectivity:**
- Ping gateway: `ping <gateway-ip>`
- Check DNS: `nslookup <hostname>`
- Trace route: `traceroute <host>`
- Check iptables: `iptables -L -n`

**Process management:**
- List processes: `ps aux`
- Monitor resources: `top` or `htop`
- Kill process: `kill -9 <pid>`
- Background process: `nohup <command> &`

**Log analysis:**
- View logs: `tail -f /var/log/<logfile>`
- Search logs: `grep <pattern> /var/log/<logfile>`
- Check system logs: `journalctl -u <service>`
- Rotate logs: logrotate configuration in /etc/logrotate.d/

### General DevOps Best Practices

**Container optimization:**
- Use multi-stage builds to reduce image size
- Don't run as root
- Use specific base image versions, not 'latest'
- Implement health checks
- Set proper resource limits
- Use environment variables for configuration

**Monitoring & Observability:**
- Implement structured logging (JSON format)
- Use correlation IDs for request tracing
- Monitor key metrics: CPU, memory, disk, network
- Set up alerts for critical thresholds
- Use log aggregation (ELK, Splunk, etc.)

**Security:**
- Scan images for vulnerabilities
- Use private registries
- Implement RBAC in Kubernetes
- Secret management (don't hardcode secrets)
- Network policies and firewalls
- Regular security updates
"""

# In-memory vector store
_vectorstore = None
_qa_chain = None
_chat_history = {}


def initialize_assistant():
    """Initialize the DevOps Assistant with knowledge base."""
    global _vectorstore, _qa_chain
    
    if not ChatOpenAI or not OpenAIEmbeddings or not Chroma:
        return {"status": "error", "message": "LangChain dependencies not installed"}
    
    if not os.getenv("OPENAI_API_KEY"):
        return {"status": "error", "message": "OPENAI_API_KEY not configured"}
    
    try:
        # Create embeddings
        embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
        
        # Split knowledge base into chunks
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=500,
            chunk_overlap=100,
            separators=["\n\n", "\n", ".", " "],
        )
        texts = splitter.split_text(DEFAULT_KNOWLEDGE_BASE)
        
        # Create vector store from texts
        _vectorstore = Chroma.from_texts(
            texts=texts,
            embedding=embeddings,
            collection_name="devops_knowledge",
        )
        
        # Create LLM
        llm = ChatOpenAI(
            model="gpt-3.5-turbo",
            temperature=0.3,
            max_tokens=500,
        )
        
        # Create retrieval QA chain
        _qa_chain = RetrievalQA.from_chain_type(
            llm=llm,
            chain_type="stuff",
            retriever=_vectorstore.as_retriever(search_kwargs={"k": 3}),
            return_source_documents=True,
        )
        
        return {"status": "success", "message": "DevOps Assistant initialized"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def ask_devops_assistant(question: str, container_id: Optional[str] = None, logs: str = "") -> dict:
    """
    Ask the DevOps Assistant a question.
    
    Args:
        question: The user's question
        container_id: Optional container context
        logs: Optional container logs for context
    
    Returns:
        Response with answer and source documents
    """
    global _qa_chain, _chat_history
    
    if not _qa_chain:
        init_result = initialize_assistant()
        if init_result["status"] == "error":
            return {"status": "error", "answer": init_result["message"]}
    
    try:
        # Enhance question with context
        context_question = question
        if logs:
            context_question = f"{question}\n\nRelevant logs:\n{logs[:500]}"
        
        # Run QA chain
        result = _qa_chain.invoke({"query": context_question})
        
        # Extract sources
        sources = []
        if "source_documents" in result:
            for doc in result["source_documents"]:
                sources.append(doc.page_content[:200])
        
        # Store in conversation history
        if container_id not in _chat_history:
            _chat_history[container_id or "general"] = []
        
        _chat_history[container_id or "general"].append({
            "question": question,
            "answer": result.get("result", "No answer generated"),
        })
        
        return {
            "status": "success",
            "answer": result.get("result", "No answer generated"),
            "sources": sources,
            "confidence": "high" if sources else "medium",
        }
    except Exception as e:
        return {
            "status": "error",
            "answer": f"Error processing question: {str(e)}",
        }


def get_conversation_history(container_id: Optional[str] = None) -> List[dict]:
    """Get conversation history for a container."""
    global _chat_history
    key = container_id or "general"
    return _chat_history.get(key, [])


def clear_conversation_history(container_id: Optional[str] = None):
    """Clear conversation history."""
    global _chat_history
    if container_id:
        _chat_history.pop(container_id, None)
    else:
        _chat_history.clear()
