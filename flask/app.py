from flask import Flask, request, jsonify
import requests
import tempfile
import os
from dotenv import load_dotenv

load_dotenv()  # load environment variables from .env

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions"

app = Flask(__name__)

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
        # Send to Groq API
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

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
