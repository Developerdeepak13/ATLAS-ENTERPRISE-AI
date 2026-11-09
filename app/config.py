
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )

    # AWS configuration - retained for later
    aws_region: str = "us-east-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    s3_bucket: str = ""

    # Database
    database_url: str = ""
    # Groq configuration
    groq_api_key: str = ""
    groq_chat_model: str = "openai/gpt-oss-20b"
    # Gemini configuration
    gemini_api_key: str = ""
    #gemini_chat_model: str = "gemini-3.8-flash"
    gemini_embed_model: str = "gemini-embedding-001"

    # Embedding configuration
    embed_dim: int = 768

    # Upload configuration
    max_upload_bytes: int = 10485760

    # Pinecone configuration
    pinecone_api_key: str = ""
    pinecone_index_name: str = "atlas-gemini-index"
    pinecone_cloud: str = "aws"
    pinecone_region: str = "us-east-1"
    pinecone_ready_timeout: int = 180

    # RAG configuration
    min_relevance: float = 0.25

    # Application configuration
    hitl_enabled: bool = True
    memory_turns: int = 6


@lru_cache
def settings() -> Settings:
    return Settings()
