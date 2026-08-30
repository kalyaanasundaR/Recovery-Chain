import pytest
import time

@pytest.fixture(autouse=True)
def remove_artificial_delays(monkeypatch):
    """
    Optimizes test execution by stripping artificial simulated delays 
    (e.g., from SimulatedLLMAdapter or other simulated infra).
    """
    # Patch time.sleep globally during tests to eliminate artificial latency
    def mock_sleep(seconds):
        pass
    monkeypatch.setattr(time, "sleep", mock_sleep)

def pytest_collection_modifyitems(config, items):
    for item in items:
        # Determine if test is integration or fast
        is_integration = False
        
        # Check by file name
        if item.fspath.basename in ["test_api_endpoints.py", "test_dataset_lab.py", "test_llm.py", "test_evaluation.py", "test_dataset_api.py"]:
            is_integration = True
            
        # Check by specific test name (e.g. hits API)
        if "api" in item.name and "endpoint" in item.name:
            is_integration = True
            
        # Check by fixture requests
        if hasattr(item, "fixturenames"):
            if "client" in item.fixturenames or "session" in item.fixturenames or "db" in item.fixturenames:
                is_integration = True
                
        if is_integration:
            item.add_marker(pytest.mark.integration)
        else:
            item.add_marker(pytest.mark.fast)
