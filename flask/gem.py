import os
import json
import textwrap
from typing import Dict, Any, Optional
from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv

load_dotenv()  # load GEMINI_API_KEY from .env
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

K_SCHEMES_PROFILE = 3
K_SCHEMES_GENERAL = 10


def generate_recommendation(patient_profile: Optional[Dict[str, Any]] = None) -> dict:
    """
    Generates structured scheme recommendations using Gemini.
    If patient_profile is provided, recommends 3 schemes with reason for patient.
    Otherwise, returns 10 general schemes.
    """
    if patient_profile:
        k_schemes = K_SCHEMES_PROFILE
        patient_name = patient_profile.get("name", "Patient")
        profile_text = (
            f"Patient Age: {patient_profile['age']}, "
            f"Gender: {patient_profile['gender']}, "
            f"Diseases/Conditions: {', '.join(patient_profile['diseases'])}, "
            f"Location: {patient_profile['village']}"
        )
        user_query = textwrap.dedent(f"""
        [PATIENT PROFILE]
        Name: {patient_profile.get('name', 'N/A')}
        Age: {patient_profile['age']}
        Gender: {patient_profile['gender']}
        Primary Condition: {', '.join(patient_profile['diseases'])}
        Village/Location: {patient_profile['village']}

        Recommend {k_schemes} government healthcare schemes in JSON format. 
        Include for each scheme:
        - name
        - description
        - target_group
        - benefits
        - how_to_apply
        - reason_this_scheme_works (personalized explanation for the patient)
        The JSON should be an array of schemes.
        """)
    else:
        k_schemes = K_SCHEMES_GENERAL
        user_query = textwrap.dedent(f"""
        Recommend {k_schemes} government healthcare schemes in India in JSON format. 
        Include for each scheme:
        - name
        - description
        - target_group
        - benefits
        - how_to_apply
        The JSON should be an array of schemes.
        """)

    system_instruction = textwrap.dedent("""
        You are an expert, compassionate healthcare scheme advisor in India.
        Respond ONLY in valid JSON format as requested.
        Tone: professional, helpful, and reassuring.
    """)

    try:
        llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", api_key=GEMINI_API_KEY)
        response = llm.invoke([
            ("system", system_instruction),
            ("user", user_query),
        ])
        if not response.content:
            raise ValueError("Empty response from Gemini.")
        
        # Ensure response is valid JSON
        try:
            result_json = json.loads(response.content)
        except json.JSONDecodeError:
            # If Gemini returns malformed JSON, try to fix simple issues
            text = response.content.strip()
            if text.startswith("```json"):
                text = text[text.find("\n")+1:]
            if text.endswith("```"):
                text = text[:text.rfind("```")]
            result_json = json.loads(text)
        
        return result_json

    except Exception as e:
        print(f"Error during Gemini call: {e}")
        return {}


# -----------------------------
# Main
# -----------------------------
if __name__ == "__main__":
    # Example 1: With patient profile
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
    recommendation_with_profile = generate_recommendation(sample_patient)
    print(json.dumps(recommendation_with_profile, indent=2))

    # Example 2: General schemes list
    print("\n" + "="*50)
    print("GENERATING GENERAL SCHEMES LIST")
    print("="*50)
    general_schemes = generate_recommendation()
    print(json.dumps(general_schemes, indent=2))
