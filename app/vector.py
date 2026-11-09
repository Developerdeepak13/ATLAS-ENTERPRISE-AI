
import logging
import time
from functools import lru_cache

from pinecone import Pinecone
from pinecone import DenseVectorQuery

from app.config import settings
from app.observability import trace

log = logging.getLogger(__name__)

VECTOR_FIELD = "embeddings"


@lru_cache(maxsize=1)
def index():
    """Connect to the existing schema-based Pinecone index."""
    s = settings()

    if not s.pinecone_api_key:
        raise RuntimeError("PINECONE_API_KEY is missing from .env")

    if not s.pinecone_index_name:
        raise RuntimeError("PINECONE_INDEX_NAME is missing from .env")

    pc = Pinecone(api_key=s.pinecone_api_key)
    name = s.pinecone_index_name

    info = pc.describe_index(name)

    deadline = time.monotonic() + s.pinecone_ready_timeout

    while True:
        info = pc.describe_index(name)
        status = info.status

        ready = (
            status.get("ready", False)
            if isinstance(status, dict)
            else getattr(status, "ready", False)
        )

        if ready:
            break

        if time.monotonic() >= deadline:
            raise TimeoutError(
                f"Pinecone index {name} was not ready within "
                f"{s.pinecone_ready_timeout}s"
            )

        time.sleep(3)

    log.info("Pinecone document index %s is ready", name)

    return pc.index(name)


def namespace(tenant):
    return "tenant-" + str(tenant)


@trace("upsert")
def upsert(tenant, records):
    """
    Accept the existing worker format:
    {
        id: ...,
        values: [...],
        metadata: {...}
    }

    Convert it into Pinecone schema-based documents.
    """

    documents = []

    for record in records:
        vector = record["values"]

        if len(vector) != settings().embed_dim:
            raise ValueError(
                f"Embedding dimension mismatch: got {len(vector)}, "
                f"expected {settings().embed_dim}"
            )

        metadata = record.get("metadata") or {}

        document = {
            "_id": str(record["id"]),
            VECTOR_FIELD: vector,
            **metadata,
        }

        documents.append(document)

    if not documents:
        return None

    result = index().documents.upsert(
        namespace=namespace(tenant),
        documents=documents,
    )

    log.info(
        "Upserted %d documents into Pinecone namespace %s",
        len(documents),
        namespace(tenant),
    )

    return result


@trace("search")
def search(tenant, vector, groups, owner, limit=5):
    """Perform semantic search with tenant and document ACL filtering."""

    if len(vector) != settings().embed_dim:
        raise ValueError(
            f"Query embedding dimension mismatch: got {len(vector)}, "
            f"expected {settings().embed_dim}"
        )

    groups = list(groups or [])

    owner_filter = {
        "owner_sub": {"$eq": owner}
    }

    if groups:
        acl_filter = {
            "$or": [
                {"allowed_groups": {"$in": groups}},
                owner_filter,
            ]
        }
    else:
        acl_filter = owner_filter

    result = index().documents.search(
        namespace=namespace(tenant),
        top_k=limit,
        score_by=[
            DenseVectorQuery(
                field=VECTOR_FIELD,
                values=vector,
            )
        ],
        filter=acl_filter,
        include_fields=[
            "document_id",
            "title",
            "page",
            "text",
            "owner_sub",
            "allowed_groups",
        ],
    )

    matches = []

    for document in result.matches:
        metadata = {
            field: document.get(field)
            for field in (
                "document_id",
                "title",
                "page",
                "text",
                "owner_sub",
                "allowed_groups",
            )
            if document.get(field) is not None
        }

        matches.append({
            "id": document.id,
            "score": document.score,
            "metadata": metadata,
        })

    return matches


@trace("delete_document")
def delete_document(tenant, ids):
    """Delete document chunks by their IDs from the tenant namespace."""

    if not ids:
        return None

    return index().documents.delete(
        namespace=namespace(tenant),
        ids=[str(record_id) for record_id in ids],
    )
