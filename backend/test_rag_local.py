import sys, time
sys.path.append('backend')
import rag
print('RAG provider:', rag.EMBED_PROVIDER, 'model:', rag.EMBED_MODEL)
print('Starting rag worker...')
rag.start()
print('Enqueueing document...')
rag.add_documents([{'id':'tmp-local-1','title':'Local test','text':'This is a sample document for local RAG testing.'}])
print('Waiting for ingestion...')
time.sleep(5)
print('Searching...')
res = rag.search('sample document', k=3)
print('Results:', res)
