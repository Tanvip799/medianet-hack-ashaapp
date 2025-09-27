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

    with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp:
        audio_path = tmp.name
        audio_file.save(audio_path)

    try:
        # Send to Groq API
        with open(audio_path, "rb") as f:
            response = requests.post(
                GROQ_API_URL,
                headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
                files={"file": f},
                data={
                    "model": "whisper-large-v3",
                    "language": "auto"  # auto-detect Hindi, Marathi, Hinglish, or English
                },
                timeout=30000
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
