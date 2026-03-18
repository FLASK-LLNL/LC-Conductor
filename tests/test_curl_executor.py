###############################################################################
## Copyright 2025-2026 Lawrence Livermore National Security, LLC.
## See the top-level LICENSE file for details.
##
## SPDX-License-Identifier: Apache-2.0
###############################################################################

"""
Tests for curl_executor module.

Tests cover:
- Successful command execution
- Error handling (timeout, connection errors, parser errors)
- Request library integration
- Endpoint handler logic
"""

import pytest
import requests
from unittest.mock import Mock, patch, AsyncMock
from lc_conductor.curl_executor import execute_curl_command, execute_curl_endpoint_handler


@pytest.mark.asyncio
class TestExecuteCurlCommand:
    """Test the execute_curl_command function."""

    async def test_successful_get_request(self, mocker, mock_successful_response):
        """Test successful GET request execution."""
        mock_requests = mocker.patch('lc_conductor.curl_executor.requests')
        mock_requests.request.return_value = mock_successful_response

        cmd = "curl https://api.example.com/users"
        result = await execute_curl_command(cmd, "test-client")

        assert result["success"] is True
        assert result["status_code"] == 200
        assert result["body"] == '{"message": "success"}'
        assert "Content-Type" in result["headers"]
        assert result["execution_time_ms"] > 0
        assert "timestamp" in result

        # Verify requests.request was called correctly
        mock_requests.request.assert_called_once()
        call_kwargs = mock_requests.request.call_args[1]
        assert call_kwargs["method"] == "GET"
        assert call_kwargs["url"] == "https://api.example.com/users"
        assert call_kwargs["timeout"] == 30.0
        assert call_kwargs["allow_redirects"] is True

    async def test_successful_post_request(self, mocker, mock_successful_response):
        """Test successful POST request with data."""
        mock_requests = mocker.patch('lc_conductor.curl_executor.requests')
        mock_requests.request.return_value = mock_successful_response

        cmd = 'curl -X POST https://api.example.com/users -d \'{"name": "test"}\''
        result = await execute_curl_command(cmd, "test-client")

        assert result["success"] is True
        assert result["status_code"] == 200

        # Verify POST data was sent
        call_kwargs = mock_requests.request.call_args[1]
        assert call_kwargs["method"] == "POST"
        assert call_kwargs["data"] == '{"name": "test"}'

    async def test_request_with_headers(self, mocker, mock_successful_response):
        """Test request with custom headers."""
        mock_requests = mocker.patch('lc_conductor.curl_executor.requests')
        mock_requests.request.return_value = mock_successful_response

        cmd = 'curl -H "Authorization: Bearer token123" https://api.example.com/data'
        result = await execute_curl_command(cmd, "test-client")

        assert result["success"] is True

        # Verify headers were sent
        call_kwargs = mock_requests.request.call_args[1]
        assert call_kwargs["headers"]["Authorization"] == "Bearer token123"

    async def test_timeout_error(self, mocker):
        """Test handling of request timeout."""
        mock_requests = mocker.patch('lc_conductor.curl_executor.requests')
        mock_requests.exceptions.Timeout = requests.exceptions.Timeout
        mock_requests.request.side_effect = requests.exceptions.Timeout("Timeout occurred")

        cmd = "curl https://slow.example.com"
        result = await execute_curl_command(cmd, "test-client")

        assert result["success"] is False
        assert "timed out" in result["error"]
        assert "30 seconds" in result["error"]
        assert "timestamp" in result
        assert result["execution_time_ms"] > 0

    async def test_connection_error(self, mocker):
        """Test handling of connection error."""
        mock_requests = mocker.patch('lc_conductor.curl_executor.requests')
        mock_requests.exceptions.Timeout = requests.exceptions.Timeout
        mock_requests.exceptions.ConnectionError = requests.exceptions.ConnectionError
        mock_requests.request.side_effect = requests.exceptions.ConnectionError("Connection refused")

        cmd = "curl https://unreachable.example.com"
        result = await execute_curl_command(cmd, "test-client")

        assert result["success"] is False
        assert "Connection failed" in result["error"]
        assert "Connection refused" in result["error"]

    async def test_parser_validation_error(self):
        """Test handling of invalid curl command (parser error)."""
        cmd = "curl file:///tmp/test.txt"
        result = await execute_curl_command(cmd, "test-client")

        assert result["success"] is False
        assert "Invalid command" in result["error"]
        assert "Only http/https protocols allowed" in result["error"]

    async def test_generic_exception(self, mocker):
        """Test handling of unexpected exceptions."""
        mock_requests = mocker.patch('lc_conductor.curl_executor.requests')
        mock_requests.exceptions.Timeout = requests.exceptions.Timeout
        mock_requests.exceptions.ConnectionError = requests.exceptions.ConnectionError
        mock_requests.request.side_effect = Exception("Unexpected error")

        cmd = "curl https://example.com"
        result = await execute_curl_command(cmd, "test-client")

        assert result["success"] is False
        assert "Execution failed" in result["error"]
        assert "Unexpected error" in result["error"]

    async def test_response_headers_included(self, mocker):
        """Test that response headers are included in result."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = "body"
        mock_response.headers = {
            "Content-Type": "application/json",
            "X-Custom-Header": "value"
        }

        mock_requests = mocker.patch('lc_conductor.curl_executor.requests')
        mock_requests.request.return_value = mock_response

        cmd = "curl https://example.com"
        result = await execute_curl_command(cmd, "test-client")

        assert result["success"] is True
        assert "Content-Type" in result["headers"]
        assert result["headers"]["Content-Type"] == "application/json"
        assert result["headers"]["X-Custom-Header"] == "value"

    async def test_empty_response_body(self, mocker):
        """Test handling of empty response body."""
        mock_response = Mock()
        mock_response.status_code = 204
        mock_response.text = ""
        mock_response.headers = {}

        mock_requests = mocker.patch('lc_conductor.curl_executor.requests')
        mock_requests.request.return_value = mock_response

        cmd = "curl https://example.com"
        result = await execute_curl_command(cmd, "test-client")

        assert result["success"] is True
        assert result["status_code"] == 204
        assert result["body"] == ""

    async def test_large_response_body(self, mocker):
        """Test handling of large response bodies."""
        large_body = "x" * 100000

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = large_body
        mock_response.headers = {}

        mock_requests = mocker.patch('lc_conductor.curl_executor.requests')
        mock_requests.request.return_value = mock_response

        cmd = "curl https://example.com"
        result = await execute_curl_command(cmd, "test-client")

        assert result["success"] is True
        assert len(result["body"]) == 100000

    async def test_execution_time_tracking(self, mocker, mock_successful_response):
        """Test that execution time is tracked."""
        mock_requests = mocker.patch('lc_conductor.curl_executor.requests')
        mock_requests.request.return_value = mock_successful_response

        cmd = "curl https://example.com"
        result = await execute_curl_command(cmd, "test-client")

        assert "execution_time_ms" in result
        assert isinstance(result["execution_time_ms"], float)
        assert result["execution_time_ms"] >= 0

    async def test_timestamp_format(self, mocker, mock_successful_response):
        """Test that timestamp is in ISO format."""
        mock_requests = mocker.patch('lc_conductor.curl_executor.requests')
        mock_requests.request.return_value = mock_successful_response

        cmd = "curl https://example.com"
        result = await execute_curl_command(cmd, "test-client")

        assert "timestamp" in result
        assert isinstance(result["timestamp"], str)
        assert result["timestamp"].endswith("Z")  # UTC indicator

    async def test_allow_redirects_enabled(self, mocker, mock_successful_response):
        """Test that redirect following is enabled."""
        mock_requests = mocker.patch('lc_conductor.curl_executor.requests')
        mock_requests.request.return_value = mock_successful_response

        cmd = "curl https://example.com"
        await execute_curl_command(cmd, "test-client")

        call_kwargs = mock_requests.request.call_args[1]
        assert call_kwargs["allow_redirects"] is True


@pytest.mark.asyncio
class TestExecuteCurlEndpointHandler:
    """Test the execute_curl_endpoint_handler function."""

    async def test_successful_execution(self, mocker, mock_request, mock_successful_response):
        """Test successful endpoint handler execution."""
        mock_requests = mocker.patch('lc_conductor.curl_executor.requests')
        mock_requests.request.return_value = mock_successful_response

        # Mock get_client_info from tool_registration module
        mocker.patch(
            'lc_conductor.tool_registration.get_client_info',
            return_value="192.168.1.100"
        )

        cmd = "curl https://example.com"
        result = await execute_curl_endpoint_handler(mock_request, cmd)

        assert result["success"] is True
        assert result["status_code"] == 200

    async def test_client_info_extraction(self, mocker, mock_request, mock_successful_response):
        """Test that client info is extracted from request."""
        mock_requests = mocker.patch('lc_conductor.curl_executor.requests')
        mock_requests.request.return_value = mock_successful_response

        mock_get_client_info = mocker.patch(
            'lc_conductor.tool_registration.get_client_info',
            return_value="192.168.1.100"
        )

        cmd = "curl https://example.com"
        await execute_curl_endpoint_handler(mock_request, cmd)

        # Verify get_client_info was called with request
        mock_get_client_info.assert_called_once_with(mock_request)

    async def test_error_handling_in_handler(self, mocker, mock_request):
        """Test that handler catches and formats exceptions."""
        # Mock execute_curl_command to raise exception
        mocker.patch(
            'lc_conductor.curl_executor.execute_curl_command',
            side_effect=Exception("Unexpected handler error")
        )

        mocker.patch(
            'lc_conductor.tool_registration.get_client_info',
            return_value="test-client"
        )

        cmd = "curl https://example.com"
        result = await execute_curl_endpoint_handler(mock_request, cmd)

        assert result["success"] is False
        assert "Execution failed" in result["error"]
        assert "Unexpected handler error" in result["error"]
        assert "timestamp" in result

    async def test_parser_error_in_handler(self, mocker, mock_request):
        """Test that handler handles parser validation errors."""
        mocker.patch(
            'lc_conductor.tool_registration.get_client_info',
            return_value="test-client"
        )

        cmd = "curl file:///tmp/test.txt"
        result = await execute_curl_endpoint_handler(mock_request, cmd)

        assert result["success"] is False
        assert "Invalid command" in result["error"]


@pytest.mark.asyncio
class TestIntegrationScenarios:
    """Integration-style tests covering end-to-end scenarios."""

    async def test_complete_post_workflow(self, mocker):
        """Test complete POST request workflow."""
        mock_response = Mock()
        mock_response.status_code = 201
        mock_response.text = '{"id": 123, "name": "created"}'
        mock_response.headers = {"Location": "/users/123"}

        mock_requests = mocker.patch('lc_conductor.curl_executor.requests')
        mock_requests.request.return_value = mock_response

        cmd = 'curl -X POST https://api.example.com/users -H "Content-Type: application/json" -d \'{"name": "test"}\''
        result = await execute_curl_command(cmd, "test-client")

        assert result["success"] is True
        assert result["status_code"] == 201
        assert "id" in result["body"]
        assert result["headers"]["Location"] == "/users/123"

        # Verify full request details
        call_kwargs = mock_requests.request.call_args[1]
        assert call_kwargs["method"] == "POST"
        assert call_kwargs["headers"]["Content-Type"] == "application/json"
        assert '{"name": "test"}' in call_kwargs["data"]

    async def test_authentication_workflow(self, mocker):
        """Test request with authentication header."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = '{"authenticated": true}'
        mock_response.headers = {}

        mock_requests = mocker.patch('lc_conductor.curl_executor.requests')
        mock_requests.request.return_value = mock_response

        cmd = 'curl -H "Authorization: Bearer secret-token" https://api.example.com/protected'
        result = await execute_curl_command(cmd, "test-client")

        assert result["success"] is True

        call_kwargs = mock_requests.request.call_args[1]
        assert call_kwargs["headers"]["Authorization"] == "Bearer secret-token"

    async def test_error_response_handling(self, mocker):
        """Test handling of HTTP error responses (4xx, 5xx)."""
        mock_response = Mock()
        mock_response.status_code = 404
        mock_response.text = '{"error": "Not found"}'
        mock_response.headers = {}

        mock_requests = mocker.patch('lc_conductor.curl_executor.requests')
        mock_requests.request.return_value = mock_response

        cmd = "curl https://api.example.com/notfound"
        result = await execute_curl_command(cmd, "test-client")

        # Should still succeed (request completed), but with error status code
        assert result["success"] is True
        assert result["status_code"] == 404
        assert "Not found" in result["body"]
