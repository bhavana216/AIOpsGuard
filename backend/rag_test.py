import time
import rag

print('chromadb module available')
try:
    rag.start()
    print('RAG worker started')
except Exception as e:
    print('RAG start error:', e)

# enqueue a small doc
try:
    rag.add_documents([{"id":"test-doc-1","title":"DB runbook","text":"If connections are refused, check firewall, port, and DB listeners."}])
    print('Document enqueued')
except Exception as e:
    print('Enqueue error:', e)

# wait for worker to process batch
print('Waiting for ingestion...')
time.sleep(5)

# perform a synchronous search (requires OPENAI_API_KEY)
try:
    res = rag.search('connection refused', k=3)
    print('Search results:', res)
except Exception as e:
    print('Search error:', e)
