# LC-Conductor Test Suite

Comprehensive pytest-based test suite for the curl command infrastructure.

## Quick Start

```bash
# Install test dependencies
pip install -e ".[test]"

# Run all tests
pytest

# Run unit tests only (fast)
pytest -m "not integration"

# Run with coverage
pytest --cov=lc_conductor
```

## Test Structure

```
tests/
├── conftest.py                  # Shared fixtures and configuration
├── test_curl_parser.py          # Parser validation tests (80+ tests)
├── test_curl_executor.py        # Executor and handler tests (30+ tests)
└── test_curl_integration.py     # Integration tests (20+ tests)
```

## Running Tests

### Basic Commands

```bash
# All tests
pytest

# Specific file
pytest tests/test_curl_parser.py

# Specific test
pytest tests/test_curl_parser.py::TestValidCurlCommands::test_simple_get_request

# Pattern matching
pytest -k "test_get"
```

### By Category

```bash
# Unit tests only (fast, no internet required)
pytest -m "not integration"

# Integration tests (requires internet)
pytest -m integration
```

### With Coverage

```bash
# Coverage report in terminal
pytest --cov=lc_conductor --cov-report=term-missing

# HTML coverage report
pytest --cov-report=html
open htmlcov/index.html
```

## Test Categories

### Parser Tests (`test_curl_parser.py`)
- Valid command parsing (GET, POST, PUT, DELETE, etc.)
- Security validations (protocol restrictions, shell metacharacters)
- Edge cases and error handling

### Executor Tests (`test_curl_executor.py`)
- Command execution with mocked HTTP requests
- Error handling (timeouts, connection errors)
- Response processing and formatting

### Integration Tests (`test_curl_integration.py`)
- Real HTTP requests to httpbin.org
- End-to-end workflows
- Performance testing

## Writing Tests

### Example Unit Test

```python
def test_simple_get_request(valid_curl_commands):
    """Test parsing a simple GET request."""
    cmd_data = valid_curl_commands["simple_get"]
    result = parse_curl_command(cmd_data["command"])

    assert result["method"] == "GET"
    assert result["url"] == cmd_data["expected"]["url"]
```

### Example Async Test

```python
@pytest.mark.asyncio
async def test_successful_execution(mocker):
    """Test successful command execution."""
    mock_requests = mocker.patch('lc_conductor.curl_executor.requests')
    mock_requests.request.return_value = Mock(status_code=200, text="OK")

    result = await execute_curl_command("curl https://example.com", "test")
    assert result["success"] is True
```

## Coverage Goals

- **Overall**: >90%
- **curl_parser.py**: >95% (critical security)
- **curl_executor.py**: >90%
