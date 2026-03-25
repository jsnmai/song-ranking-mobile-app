from fastapi import FastAPI                                                                                                     
                                                                                                                                  
app = FastAPI(title="LISTn API")                                                                                                
                
                                                                                                                                
@app.get("/api/v1/health")
def health():                                                                                                                   
    """Returns 200 if the server is running."""
    return {"status": "ok"}               