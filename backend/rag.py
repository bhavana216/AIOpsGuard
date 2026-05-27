
import os
import time
import threading
from queue import Queue, Empty
from dotenv import load_dotenv

load_dotenv()

try:
    import openai
except Exception:
    openai = None

try:
    import chromadb
    from chromadb.config import Settings
except Exception:
    chromadb = None

try:
    from sentence_transformers import SentenceTransformer
except Exception:
    SentenceTransformer = None

# Configuration
PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "backend/chroma_db")
COLLECTION_NAME = os.getenv("CHROMA_COLLECTION", "ai_docs")
EMBED_PROVIDER = os.getenv("EMBED_PROVIDER", "local").lower()
EMBED_MODEL = os.getenv("EMBED_MODEL", "all-MiniLM-L6-v2")

# Batching settings
BATCH_SIZE = int(os.getenv("RAG_BATCH_SIZE", "16"))
BATCH_INTERVAL = float(os.getenv("RAG_BATCH_INTERVAL", "2.0"))

_local_embed_model = None

# Internal state
_client = None
_collection = None
_queue = Queue()
_worker = None
_running = False
_last_upsert_time = None


def _init_chroma():
    global _client, _collection
    if chromadb is None:
        raise RuntimeError("chromadb is not installed")
    if _client is None:
        # Use the newer client construction; avoid deprecated "chroma_db_impl" config
        try:
            _client = chromadb.Client(Settings(persist_directory=PERSIST_DIR))
        except TypeError:
            # Fall back to simple client() if Settings signature differs
            _client = chromadb.Client()

    try:
        # get_collection may raise if collection does not exist
        _collection = _client.get_collection(name=COLLECTION_NAME)
    except Exception:
        _collection = _client.create_collection(name=COLLECTION_NAME)


def _embed_texts(texts):
    global _local_embed_model
    # decide provider: if user asked for openai but key is missing, fall back to local
    provider = EMBED_PROVIDER
    if EMBED_PROVIDER == "openai":
        if not openai or not getattr(openai, "api_key", None):
            provider = "local"

    if provider == "openai":
        resp = openai.Embeddings.create(model=EMBED_MODEL, input=texts)
        return [r["embedding"] for r in resp.data]

    if provider in {"sentence-transformers", "sentence_transformers", "local", "hf", "huggingface"}:
        if SentenceTransformer is None:
            raise RuntimeError("sentence-transformers is not installed")
        if _local_embed_model is None:
            _local_embed_model = SentenceTransformer(EMBED_MODEL)
        embeddings = _local_embed_model.encode(texts, show_progress_bar=False, convert_to_numpy=True)
        return [emb.tolist() if hasattr(emb, "tolist") else list(emb) for emb in embeddings]

    raise RuntimeError(f"Unsupported EMBED_PROVIDER: {provider}")


def _worker_loop():
    global _running
    while _running:
        batch = []
        try:
            # collect up to BATCH_SIZE immediately available items
            for _ in range(BATCH_SIZE):
                item = _queue.get_nowait()
                batch.append(item)
        except Empty:
            pass

        if not batch:
            # wait for a short interval for items to accumulate
            time.sleep(BATCH_INTERVAL)
            try:
                item = _queue.get_nowait()
                batch.append(item)
            except Empty:
                continue

        # prepare batch
        ids = [d.get("id") for d in batch]
        texts = [d.get("text", "") for d in batch]
        metadatas = [{"title": d.get("title", "")} for d in batch]

        try:
            embeddings = _embed_texts(texts)
            # upsert to chroma
            _collection.upsert(ids=ids, documents=texts, metadatas=metadatas, embeddings=embeddings)
            try:
                # record last upsert timestamp
                global _last_upsert_time
                _last_upsert_time = time.time()
            except Exception:
                pass
        except Exception:
            # On failure, drop batch (we could re-enqueue or persist to disk)
            pass


def start(background=True):
    """Initialize chroma and start background batching worker."""
    global _worker, _running
    try:
        _init_chroma()
    except Exception:
        # If Chroma can't be initialized, don't start the worker but allow enqueue/search to continue (they'll be no-ops)
        return

    if background and (_worker is None or not _worker.is_alive()):
        _running = True
        _worker = threading.Thread(target=_worker_loop, daemon=True)
        _worker.start()


def stop():
    global _running
    _running = False


def add_documents(docs):
    """Enqueue documents for asynchronous batched ingestion.

    docs: list of {"id": str, "title": str, "text": str}
    """
    for d in docs:
        _queue.put(d)


def get_status():
    """Return RAG ingestion/search status: queue size, collection count, last upsert time."""
    size = _queue.qsize()
    count = None
    try:
        if chromadb is not None:
            _init_chroma()
            if _collection is not None and hasattr(_collection, 'count'):
                try:
                    count = _collection.count()
                except Exception:
                    count = None
    except Exception:
        count = None
    return {
        'queue_size': size,
        'collection_count': count,
        'last_upsert_time': _last_upsert_time,
    }


def search(query, k=3):
    """Synchronous search returning top-k matching documents (dicts).

    If embeddings/OpenAI isn't available, returns empty list.
    """
    if chromadb is None:
        return []
    try:
        _init_chroma()
        q_emb = _embed_texts([query])[0]
        # request metadatas, documents and distances (some chroma versions disallow 'ids' in include)
        results = _collection.query(query_embeddings=[q_emb], n_results=k, include=['metadatas', 'documents', 'distances'])
        # results fields are lists per query: ids, documents, metadatas, distances
        ids_batch = results.get('ids', [[]])[0] if results.get('ids') else []
        docs_batch = results.get('documents', [[]])[0] if results.get('documents') else []
        metas_batch = results.get('metadatas', [[]])[0] if results.get('metadatas') else []
        dists_batch = results.get('distances', [[]])[0] if results.get('distances') else []

        out = []
        for idx in range(len(ids_batch)):
            out.append({
                'id': ids_batch[idx],
                'title': metas_batch[idx].get('title', '') if idx < len(metas_batch) else '',
                'text': docs_batch[idx] if idx < len(docs_batch) else '',
                'score': dists_batch[idx] if idx < len(dists_batch) else None,
            })
        return out
    except Exception:
        return []

