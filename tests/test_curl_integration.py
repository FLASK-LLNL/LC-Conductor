###############################################################################
## Copyright 2025-2026 Lawrence Livermore National Security, LLC.
## See the top-level LICENSE file for details.
##
## SPDX-License-Identifier: Apache-2.0
###############################################################################

"""
Integration tests for curl command infrastructure.

These tests verify the full stack from command parsing through execution.
They use real HTTP requests to test services like httpbin.org.
"""

import pytest
from lc_conductor.curl_executor import execute_curl_command


@pytest.mark.integration
@pytest.mark.asyncio
class TestRealHTTPRequests:
    """
    Integration tests using real HTTP requests.

    Note: These tests require internet connectivity and may be slow.
    Mark with @pytest.mark.integration to allow selective execution.
    Run with: pytest -m integration
    """

    async def test_httpbin_get(self):
        """Test GET request to httpbin.org."""
        cmd = "curl https://httpbin.org/get"
        result = await execute_curl_command(cmd, "integration-test")

        assert result["success"] is True
        assert result["status_code"] == 200
        assert "httpbin.org" in result["body"]

    async def test_httpbin_post(self):
        """Test POST request to httpbin.org."""
        cmd = 'curl -X POST https://httpbin.org/post -d \'{"test": "data"}\''
        result = await execute_curl_command(cmd, "integration-test")

        assert result["success"] is True
        assert result["status_code"] == 200
        assert "test" in result["body"]

    async def test_httpbin_headers(self):
        """Test request with custom headers."""
        cmd = 'curl -H "X-Custom-Header: test-value" https://httpbin.org/headers'
        result = await execute_curl_command(cmd, "integration-test")

        assert result["success"] is True
        assert result["status_code"] == 200
        assert "X-Custom-Header" in result["body"]

    async def test_httpbin_status_codes(self):
        """Test handling of different status codes."""
        # Test 404
        cmd = "curl https://httpbin.org/status/404"
        result = await execute_curl_command(cmd, "integration-test")

        assert result["success"] is True
        assert result["status_code"] == 404


@pytest.mark.asyncio
class TestEndToEndScenarios:
    """End-to-end scenarios using mocked responses."""

    async def test_full_crud_workflow(self, mocker):
        """Test complete CRUD workflow."""
        mock_requests = mocker.patch('lc_conductor.curl_executor.requests')

        # CREATE (POST)
        create_response = mocker.Mock()
        create_response.status_code = 201
        create_response.text = '{"id": 1, "name": "Item 1"}'
        create_response.headers = {"Location": "/items/1"}

        mock_requests.request.return_value = create_response

        cmd = 'curl -X POST https://api.example.com/items -d \'{"name": "Item 1"}\''
        result = await execute_curl_command(cmd, "test")

        assert result["success"] is True
        assert result["status_code"] == 201

        # READ (GET)
        read_response = mocker.Mock()
        read_response.status_code = 200
        read_response.text = '{"id": 1, "name": "Item 1"}'
        read_response.headers = {}

        mock_requests.request.return_value = read_response

        cmd = "curl https://api.example.com/items/1"
        result = await execute_curl_command(cmd, "test")

        assert result["success"] is True
        assert result["status_code"] == 200

        # UPDATE (PUT)
        update_response = mocker.Mock()
        update_response.status_code = 200
        update_response.text = '{"id": 1, "name": "Updated Item"}'
        update_response.headers = {}

        mock_requests.request.return_value = update_response

        cmd = 'curl -X PUT https://api.example.com/items/1 -d \'{"name": "Updated Item"}\''
        result = await execute_curl_command(cmd, "test")

        assert result["success"] is True
        assert result["status_code"] == 200

        # DELETE
        delete_response = mocker.Mock()
        delete_response.status_code = 204
        delete_response.text = ""
        delete_response.headers = {}

        mock_requests.request.return_value = delete_response

        cmd = "curl -X DELETE https://api.example.com/items/1"
        result = await execute_curl_command(cmd, "test")

        assert result["success"] is True
        assert result["status_code"] == 204

    async def test_retry_scenario(self, mocker):
        """Test scenario where first request fails, second succeeds."""
        mock_requests = mocker.patch('lc_conductor.curl_executor.requests')

        # First attempt: timeout
        mock_requests.request.side_effect = [
            TimeoutError("Connection timeout"),
            mocker.Mock(
                status_code=200,
                text='{"data": "success"}',
                headers={}
            )
        ]

        # First attempt fails
        cmd = "curl https://api.example.com/data"
        result1 = await execute_curl_command(cmd, "test")
        assert result1["success"] is False

        # Second attempt succeeds
        result2 = await execute_curl_command(cmd, "test")
        assert result2["success"] is True
        assert result2["status_code"] == 200

    async def test_multiple_commands_sequence(self, mocker):
        """Test executing multiple different commands in sequence."""
        mock_requests = mocker.patch('lc_conductor.curl_executor.requests')

        commands = [
            ("curl https://api.example.com/users", 200, "GET"),
            ("curl -X POST https://api.example.com/users -d '{}'", 201, "POST"),
            ("curl -X PUT https://api.example.com/users/1 -d '{}'", 200, "PUT"),
            ("curl -X DELETE https://api.example.com/users/1", 204, "DELETE"),
        ]

        for cmd, expected_status, expected_method in commands:
            mock_response = mocker.Mock()
            mock_response.status_code = expected_status
            mock_response.text = "{}"
            mock_response.headers = {}

            mock_requests.request.return_value = mock_response

            result = await execute_curl_command(cmd, "test")

            assert result["success"] is True
            assert result["status_code"] == expected_status

            call_kwargs = mock_requests.request.call_args[1]
            assert call_kwargs["method"] == expected_method


@pytest.mark.asyncio
class TestErrorRecovery:
    """Test error recovery and edge case handling."""

    async def test_partial_failure_handling(self, mocker):
        """Test handling when parser succeeds but execution fails."""
        mock_requests = mocker.patch('lc_conductor.curl_executor.requests')
        mock_requests.request.side_effect = ConnectionError("Network unreachable")

        cmd = "curl https://example.com"
        result = await execute_curl_command(cmd, "test")

        assert result["success"] is False
        assert "Connection failed" in result["error"]
        assert "execution_time_ms" in result
        assert "timestamp" in result

    async def test_malformed_url_handling(self):
        """Test handling of malformed URLs."""
        cmd = "curl https://not a valid url"
        result = await execute_curl_command(cmd, "test")

        # Parser should catch this or requests will
        assert result["success"] is False
        assert "error" in result

    async def test_unicode_in_command(self, mocker):
        """Test handling of unicode characters in command."""
        mock_response = mocker.Mock()
        mock_response.status_code = 200
        mock_response.text = '{"message": "success"}'
        mock_response.headers = {}

        mock_requests = mocker.patch('lc_conductor.curl_executor.requests')
        mock_requests.request.return_value = mock_response

        cmd = 'curl -d \'{"name": "测试"}\' https://example.com'
        result = await execute_curl_command(cmd, "test")

        assert result["success"] is True

    async def test_very_long_url(self, mocker):
        """Test handling of very long URLs (but within limit)."""
        mock_response = mocker.Mock()
        mock_response.status_code = 200
        mock_response.text = "OK"
        mock_response.headers = {}

        mock_requests = mocker.patch('lc_conductor.curl_executor.requests')
        mock_requests.request.return_value = mock_response

        long_path = "/path" * 100
        cmd = f"curl https://example.com{long_path}"
        result = await execute_curl_command(cmd, "test")

        assert result["success"] is True


@pytest.mark.asyncio
class TestPerformance:
    """Performance-related tests."""

    async def test_execution_time_reasonable(self, mocker):
        """Test that execution time is tracked reasonably."""
        import time

        mock_response = mocker.Mock()
        mock_response.status_code = 200
        mock_response.text = "OK"
        mock_response.headers = {}

        mock_requests = mocker.patch('lc_conductor.curl_executor.requests')
        mock_requests.request.return_value = mock_response

        start = time.time()
        cmd = "curl https://example.com"
        result = await execute_curl_command(cmd, "test")
        end = time.time()

        actual_time_ms = (end - start) * 1000

        # Execution time should be reasonable
        assert result["execution_time_ms"] > 0
        assert result["execution_time_ms"] < actual_time_ms + 100  # Allow some overhead

    async def test_concurrent_executions(self, mocker):
        """Test multiple concurrent command executions."""
        import asyncio

        mock_response = mocker.Mock()
        mock_response.status_code = 200
        mock_response.text = "OK"
        mock_response.headers = {}

        mock_requests = mocker.patch('lc_conductor.curl_executor.requests')
        mock_requests.request.return_value = mock_response

        # Execute 5 commands concurrently
        tasks = [
            execute_curl_command(f"curl https://example.com/endpoint{i}", "test")
            for i in range(5)
        ]

        results = await asyncio.gather(*tasks)

        assert len(results) == 5
        assert all(r["success"] for r in results)
