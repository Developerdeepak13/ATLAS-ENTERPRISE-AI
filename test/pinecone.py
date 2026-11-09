
from app.aws import embed
from app.vector import upsert, search, delete_document

TEST_TENANT = "atlas-test"
TEST_OWNER = "atlas-test-user"

text = "ATLAS is an enterprise AI knowledge copilot."

print("1. Generating Gemini embedding...")
vector = embed(text)

print("Embedding dimension:", len(vector))

record_id = "atlas-pinecone-test-001"

print("2. Storing test vector...")

upsert(
    TEST_TENANT,
    [{
        "id": record_id,
        "values": vector,
        "metadata": {
            "document_id": "test-document",
            "title": "ATLAS Test",
            "page": 1,
            "text": text,
            "owner_sub": TEST_OWNER,
            "allowed_groups": []
        }
    }]
)

print("3. Searching Pinecone...")

results = search(
    TEST_TENANT,
    vector,
    [],
    TEST_OWNER
)

for result in results:
    print("Score:", result["score"])
    print("Retrieved:", result["metadata"].get("text"))

print("4. Deleting test record...")
delete_document(TEST_TENANT, [record_id])

print("TEST COMPLETED!")
