from fastapi import FastAPI

app = FastAPI(title="MIA Private API", version="0.1.0")

@app.get("/health")
def health():
    # Deliberately returns no environment, host, or secret information.
    return {"status": "ok", "service": "mia-api", "version": "0.1.0"}
