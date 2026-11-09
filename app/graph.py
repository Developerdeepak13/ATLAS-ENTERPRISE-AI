
from typing import TypedDict, Any

from langgraph.graph import StateGraph, START, END

from app.aws import embed, answer
from app.vector import search
from app.config import settings
from app.guardrails import check_input, check_output
from app.observability import trace


# ==========================================
# 1. GRAPH STATE
# ==========================================

class State(TypedDict, total=False):
    question: str
    principal: Any
    passages: list
    answer: str
    sources: list
    status: str
    history: list


# ==========================================
# 2. INPUT GUARDRAILS
# ==========================================

@trace("guard")
def guard(s):
    return {
        "question": check_input(s["question"])
    }


# ==========================================
# 3. DOCUMENT RETRIEVAL
# ==========================================

@trace("retrieve")
def retrieve(s):

    principal = s["principal"]

    # Include the most recent user question for
    # short follow-up questions.
    prior_questions = [
        m["content"]
        for m in s.get("history", [])
        if m["role"] == "user"
    ]

    if prior_questions:
        query = (
            prior_questions[-1]
            + "\nFollow-up: "
            + s["question"]
        )
    else:
        query = s["question"]

    # Generate Gemini query embedding.
    query_embedding = embed(
        query,
        task_type="RETRIEVAL_QUERY"
    )

    # Search Pinecone using the generated embedding.
    hits = search(
        principal.tenant,
        query_embedding,
        principal.groups,
        principal.subject
    )

    # Filter results using the configured relevance threshold.
    hits = [
        hit for hit in hits
        if hit["score"] >= settings().min_relevance
    ]

    # Prepare source information for the frontend.
    sources = [
        {
            "index": i + 1,
            "document_id": hit["metadata"].get("document_id", ""),
            "title": hit["metadata"].get("title", ""),
            "page": hit["metadata"].get("page", 1),
            "excerpt": hit["metadata"].get("text", "")[:320]
        }
        for i, hit in enumerate(hits)
    ]

    return {
        "passages": hits,
        "sources": sources
    }


# ==========================================
# 4. ROUTING
# ==========================================

def route(s):

    if s["passages"]:
        return "generate"

    return "no_evidence"


# ==========================================
# 5. NO EVIDENCE RESPONSE
# ==========================================

@trace("no_evidence")
def no_evidence(s):

    return {
        "answer": (
            "I could not find supporting evidence "
            "in documents you are authorized to access."
        ),
        "status": "no_evidence"
    }


# ==========================================
# 6. GEMINI ANSWER GENERATION
# ==========================================

@trace("generate")
def generate(s):

    evidence = "\n\n".join(
        (
            f'[{i + 1}] '
            f'{hit["metadata"].get("title", "Document")}, '
            f'page {hit["metadata"].get("page", 1)}: '
            f'{hit["metadata"].get("text", "")}'
        )
        for i, hit in enumerate(s["passages"])
    )

    # Calls Gemini through the existing answer() interface.
    generated_answer = answer(
        s["question"],
        evidence,
        s.get("history", [])
    )

    return {
        "answer": generated_answer,
        "status": "answered"
    }


# ==========================================
# 7. OUTPUT VALIDATION
# ==========================================

@trace("validate")
def validate(s):

    return {
        "answer": check_output(s["answer"])
    }


# ==========================================
# 8. BUILD LANGGRAPH WORKFLOW
# ==========================================

def make_graph():

    graph = StateGraph(State)

    # Register workflow nodes.
    graph.add_node("guard", guard)
    graph.add_node("retrieve", retrieve)
    graph.add_node("no_evidence", no_evidence)
    graph.add_node("generate", generate)
    graph.add_node("validate", validate)

    # Define workflow edges.
    graph.add_edge(START, "guard")
    graph.add_edge("guard", "retrieve")

    # Conditional routing.
    graph.add_conditional_edges(
        "retrieve",
        route,
        {
            "generate": "generate",
            "no_evidence": "no_evidence"
        }
    )

    graph.add_edge("generate", "validate")
    graph.add_edge("validate", END)
    graph.add_edge("no_evidence", END)

    return graph.compile()


# ==========================================
# 9. COMPILE GRAPH
# ==========================================

graph = make_graph()


# ==========================================
# 10. CHAT ENTRY POINT
# ==========================================

@trace("chat")
def chat(principal, question, history=None):

    result = graph.invoke({
        "principal": principal,
        "question": question,
        "history": history or []
    })

    return {
        "answer": result["answer"],
        "sources": result.get("sources", []),
        "status": result.get("status", "answered")
    }
