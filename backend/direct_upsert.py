import sys
sys.path.append('backend')
import rag

print('Init chroma')
try:
    rag._init_chroma()
    print('chroma initialized')
except Exception as e:
    print('chroma init error', e)

text = 'This is a sample document for local RAG testing.'
print('Embedding...')
try:
    emb = rag._embed_texts([text])
    print('embedding length', len(emb), 'dim', len(emb[0]))
except Exception as e:
    print('embed error', e)

print('Upserting...')
try:
    rag._collection.upsert(ids=['direct-1'], documents=[text], metadatas=[{'title':'direct'}], embeddings=emb)
    print('upserted')
except Exception as e:
    print('upsert error', e)

print('Searching...')
try:
    res = rag.search('sample document', k=3)
    print('search res', res)
except Exception as e:
    print('search error', e)
