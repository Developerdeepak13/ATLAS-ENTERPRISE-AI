
"""Deterministic demo guardrails for ATLAS.
Not a substitute for a dedicated moderation system or IAM.
"""

import re
from fastapi import HTTPException


# Prompt injection and secret extraction
INJECTION = [
    r"\bignore\s+(?:all\s+|any\s+|the\s+|previous\s+|prior\s+)?(?:instructions|rules|system\s+prompt)\b",
    r"\b(?:reveal|print|show|dump|disclose)\s+(?:your\s+|the\s+|hidden\s+|internal\s+)*(?:system|developer)\s+(?:prompt|instructions)\b",
    r"\b(?:reveal|print|dump|expose|send)\s+(?:your\s+|all\s+|the\s+)*(?:api\s*keys?|passwords?|credentials?|secrets?|access\s+tokens?)\b",
    r"\b(?:bypass|disable|turn\s+off)\s+(?:all\s+|the\s+)?(?:guardrails|safety\s+checks|security\s+controls)\b",
    r"\b(?:pretend|act)\s+(?:you\s+are|as\s+if\s+you\s+are)\s+(?:the\s+)?(?:system|developer|administrator)\b",
]


# Explicit sexual-content generation requests.
# Educational and medical questions are intentionally not blocked
# merely because they mention sex or sexual health.
SEXUAL_CONTENT = [
    r"\b(?:write|generate|create|describe|roleplay|act out)\b.{0,100}\b(?:pornographic|sexually explicit|graphic sexual|erotic scene|sexual fantasy)\b",
    r"\b(?:explicit sexual roleplay|erotic roleplay|pornographic story|graphic sex scene)\b",
    r"\b(?:make|write|generate)\b.{0,80}\b(?:porn|adult erotica|explicit sexual story)\b",
]


SENSITIVE_OUTPUT = [
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----", re.I),
    re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"),
    re.compile(
        r"(?i)\b(?:aws_secret_access_key|pinecone_api_key|database_url)\s*[:=]\s*\S+"
    ),
    re.compile(
        r"(?i)\b(?:password|api[_ -]?key|secret[_ -]?key)\s*[:=]\s*[\"']?[^\s\"']{12,}"
    ),
]


class GuardrailBlocked(ValueError):
    pass


def classify_input(question: str) -> str | None:
    if not question or not question.strip():
        return "empty_input"

    if any(re.search(pattern, question, re.I) for pattern in INJECTION):
        return "prompt_injection_or_secret_request"

    if any(re.search(pattern, question, re.I) for pattern in SEXUAL_CONTENT):
        return "explicit_sexual_content"

    return None


def check_input(question: str) -> str:
    reason = classify_input(question)

    if reason:
        raise HTTPException(
            status_code=400,
            detail=f"Input guardrail blocked this request ({reason}).",
        )

    return question


def contains_sensitive_output(text: str) -> bool:
    return any(pattern.search(text or "") for pattern in SENSITIVE_OUTPUT)


def check_output(answer: str) -> str:
    if contains_sensitive_output(answer):
        return "The response was blocked by the sensitive-data output guardrail."

    if any(
        re.search(pattern, answer or "", re.I)
        for pattern in SEXUAL_CONTENT
    ):
        return "The response was blocked by the content safety guardrail."

    return answer


def check_evidence(text: str) -> str:
    """Retrieved document passages are untrusted evidence, not instructions."""
    return text
