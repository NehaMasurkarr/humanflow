from fastapi import FastAPI

app = FastAPI(
    title="HumanFlow API",
    description="Global and US Migration Analytics",
    version="0.1.0",
)

@app.get("/health")
def health():
    return {"status": "healthy", "project": "HumanFlow"}
