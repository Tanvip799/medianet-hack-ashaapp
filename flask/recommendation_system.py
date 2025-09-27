import os
import json
import textwrap
from typing import Dict, List, Any

from langchain_core.documents import Document
from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
import numpy as np
import faiss

load_dotenv()  # load GEMINI_API_KEY from .env
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

SCHEME_DB_FILE = "schemes.json"
K_SCHEMES = 3
EMBEDDING_MODEL = "all-MiniLM-L6-v2"  # free embedding model

# -----------------------------
# Load and process scheme data
# -----------------------------
def load_and_process_data(file_path: str) -> List[Document]:
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            schemes_data = json.load(f)
    except FileNotFoundError:
        print(f"Error: {file_path} not found.")
        return []

    documents = []
    for scheme in schemes_data:
        content_to_embed = f"""
        Name: {scheme['name']}
        Description: {scheme['description']}
        Target Group: {scheme['target_group']}
        Keywords: {', '.join(scheme.get('keywords', []))}
        """
        metadata = {
            "name": scheme["name"],
            "description": scheme["description"],
            "how_to_apply": scheme["how_to_apply"],
            "target_group": scheme["target_group"],
            "benefits": "\n- " + "\n- ".join(scheme.get("benefits", []))
        }
        documents.append(Document(page_content=textwrap.dedent(content_to_embed), metadata=metadata))

    print(f"Loaded {len(documents)} schemes.")
    return documents

# -----------------------------
# Create vector store using Sentence Transformers + FAISS
# -----------------------------
def create_vector_store(documents: List[Document]):
    print("Creating vector store...")
    model = SentenceTransformer(EMBEDDING_MODEL)
    embeddings = [model.encode(doc.page_content) for doc in documents]

    dim = embeddings[0].shape[0]
    index = faiss.IndexFlatL2(dim)
    index.add(np.array(embeddings))

    return {"index": index, "documents": documents, "model": model}

# -----------------------------
# Retrieve top-k schemes
# -----------------------------
def retrieve_schemes(query: str, vectorstore, k=K_SCHEMES):
    model = vectorstore["model"]
    index = vectorstore["index"]
    docs = vectorstore["documents"]

    query_vec = model.encode([query])
    distances, indices = index.search(np.array(query_vec), k)
    return [docs[i] for i in indices[0]]

# -----------------------------
# Generate recommendation using Gemini LLM
# -----------------------------
def generate_recommendation(patient_profile: Dict[str, Any], vectorstore, k_schemes=K_SCHEMES) -> str:
    profile_query = (
        f"Patient Age: {patient_profile['age']}, "
        f"Gender: {patient_profile['gender']}, "
        f"Diseases/Conditions: {', '.join(patient_profile['diseases'])}, "
        f"Location: {patient_profile['village']}"
    )

    retrieved_docs = retrieve_schemes(profile_query, vectorstore, k=k_schemes)

    system_instruction = textwrap.dedent("""
        You are an expert, compassionate healthcare scheme advisor in India.
        Your task is to recommend the best 2 to 3 government healthcare schemes from the provided context.
        Structure your response clearly:
        1. Recommended Schemes
        2. Personalized breakdown
        3. Why each scheme fits the patient's profile
        4. How to apply
        Tone: professional, helpful, reassuring.
    """)

    user_query = textwrap.dedent(f"""
[PATIENT PROFILE]
Name: {patient_profile.get('name', 'N/A')}
Age: {patient_profile['age']}
Gender: {patient_profile['gender']}
Primary Condition: {', '.join(patient_profile['diseases'])}
Village/Location: {patient_profile['village']}

Recommend 2-3 schemes based on the profile.
""")

    try:
        llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", api_key=GEMINI_API_KEY)
        response = llm.invoke([
            ("system", system_instruction),
            ("user", user_query),
        ])
        return response.content
    except Exception as e:
        return f"Error during LLM call: {e}"

# -----------------------------
# Main
# -----------------------------
if __name__ == "__main__":
    documents = load_and_process_data(SCHEME_DB_FILE)
    if not documents:
        exit()

    vector_store = create_vector_store(documents)

    sample_patient = {
        "name": "Tanvi",
        "age": 22,
        "gender": "female",
        "village": "Rampur (Rural)",
        "diseases": ["Pregnancy", "Immunization needs for baby"]
    }

    print("\n" + "="*50)
    print(f"GENERATING RECOMMENDATION for: {sample_patient['name']}")
    print("="*50)

    recommendation_text = generate_recommendation(sample_patient, vector_store)
    print(recommendation_text)
    print("\nRAG PROCESS COMPLETE")
