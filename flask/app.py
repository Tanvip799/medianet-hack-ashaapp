from flask import Flask, request, jsonify
import requests
import tempfile
import os
import textwrap
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI

load_dotenv()  # load environment variables from .env

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

app = Flask(__name__)

# -----------------------------
# Groq Whisper Transcription
# -----------------------------
@app.route('/transcribe', methods=['POST'])
def transcribe():
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file provided'}), 400

    audio_file = request.files['audio']
    original_filename = audio_file.filename or 'audio.m4a'
    mimetype = getattr(audio_file, 'mimetype', None) or 'audio/m4a'
    _, ext = os.path.splitext(original_filename)
    ext = ext if ext else '.m4a'

    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        audio_path = tmp.name
        audio_file.save(audio_path)

    try:
        with open(audio_path, "rb") as f:
            response = requests.post(
                GROQ_API_URL,
                headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
                files={"file": (original_filename, f, mimetype)},
                data={
                    "model": "whisper-large-v3"
                    # Note: Do NOT send language="auto"; omit 'language' to let the model auto-detect.
                    # If you want to force a language, set e.g. "language": "hi" (Hindi) or "en" (English)
                },
                timeout=30
            )

        if response.status_code != 200:
            return jsonify({"error": response.text}), response.status_code

        result = response.json()
        text = result.get("text", "")
        return jsonify({"transcript": text})

    finally:
        try:
            os.remove(audio_path)
        except Exception:
            pass

@app.route('/')
def health():
    return "Groq Whisper Flask API running."

# -----------------------------
# Gemini Patient Scheme Recommendations
# -----------------------------
@app.route('/recommend-schemes', methods=['POST'])
def recommend_schemes():
    data = request.json
    if not data:
        return jsonify({"error": "No data provided"}), 400

    required_fields = ["name", "age", "gender", "village", "diseases"]
    for field in required_fields:
        if field not in data:
            return jsonify({"error": f"Missing required field: {field}"}), 400

    patient_profile = data
    try:
        llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", api_key=GEMINI_API_KEY)

        system_instruction = textwrap.dedent("""
            You are an expert healthcare advisor in India.
            Recommend exactly 3 government healthcare schemes for the patient.
            Respond ONLY in strict JSON format as a list of objects with keys:
            - name
            - description
            - benefits
            - how_to_apply
            - reason_this_scheme_works
        """)

        user_query = textwrap.dedent(f"""
            [PATIENT PROFILE]
            Name: {patient_profile['name']}
            Age: {patient_profile['age']}
            Gender: {patient_profile['gender']}
            Primary Conditions: {', '.join(patient_profile['diseases'])}
            Village/Location: {patient_profile['village']}

            Return the recommendations in JSON as specified in the instructions.
        """)

        response = llm.invoke([
            ("system", system_instruction),
            ("user", user_query),
        ])

        # Ensure text exists before parsing
        if not response.content:
            return jsonify({"error": "No response from LLM"}), 500

        json_result = json.loads(response.content)
        return jsonify({"schemes": json_result})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# -----------------------------
# Run App
# -----------------------------
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
