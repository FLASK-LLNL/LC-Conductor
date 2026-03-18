###############################################################################
## Copyright 2025-2026 Lawrence Livermore National Security, LLC.
## See the top-level LICENSE file for details.
##
## SPDX-License-Identifier: Apache-2.0
###############################################################################

"""
Tests for curl_parser module.

Tests cover:
- Valid curl command parsing
- Security validations (protocol, shell metacharacters)
- Edge cases (length limits, malformed input)
- Various HTTP methods and options
"""

import pytest
from lc_conductor.curl_parser import parse_curl_command


class TestValidCurlCommands:
    """Test parsing of valid curl commands."""

    def test_simple_get_request(self, valid_curl_commands):
        """Test parsing a simple GET request."""
        cmd_data = valid_curl_commands["simple_get"]
        result = parse_curl_command(cmd_data["command"])

        assert result["method"] == cmd_data["expected"]["method"]
        assert result["url"] == cmd_data["expected"]["url"]
        assert result["headers"] == cmd_data["expected"]["headers"]
        assert result["data"] == cmd_data["expected"]["data"]
        assert result["timeout"] == 30.0

    def test_post_with_data(self, valid_curl_commands):
        """Test parsing POST request with data."""
        cmd_data = valid_curl_commands["post_with_data"]
        result = parse_curl_command(cmd_data["command"])

        assert result["method"] == "POST"
        assert result["url"] == cmd_data["expected"]["url"]
        assert result["data"] == cmd_data["expected"]["data"]

    def test_with_headers(self, valid_curl_commands):
        """Test parsing request with custom headers."""
        cmd_data = valid_curl_commands["with_headers"]
        result = parse_curl_command(cmd_data["command"])

        assert result["headers"] == cmd_data["expected"]["headers"]
        assert result["url"] == cmd_data["expected"]["url"]

    def test_put_request(self, valid_curl_commands):
        """Test parsing PUT request."""
        cmd_data = valid_curl_commands["put_with_data_and_headers"]
        result = parse_curl_command(cmd_data["command"])

        assert result["method"] == "PUT"
        assert result["url"] == cmd_data["expected"]["url"]
        assert result["data"] == cmd_data["expected"]["data"]

    def test_delete_request(self, valid_curl_commands):
        """Test parsing DELETE request."""
        cmd_data = valid_curl_commands["delete_request"]
        result = parse_curl_command(cmd_data["command"])

        assert result["method"] == "DELETE"
        assert result["url"] == cmd_data["expected"]["url"]

    def test_http_protocol(self):
        """Test that HTTP (non-HTTPS) is allowed."""
        cmd = "curl http://example.com"
        result = parse_curl_command(cmd)

        assert result["url"] == "http://example.com"
        assert result["method"] == "GET"

    def test_https_protocol(self):
        """Test that HTTPS is allowed."""
        cmd = "curl https://example.com"
        result = parse_curl_command(cmd)

        assert result["url"] == "https://example.com"

    def test_long_flags(self):
        """Test parsing with long flag formats (--request, --header, --data)."""
        cmd = 'curl --request POST --header "Content-Type: application/json" --data \'{"key": "value"}\' https://api.example.com'
        result = parse_curl_command(cmd)

        assert result["method"] == "POST"
        assert result["headers"]["Content-Type"] == "application/json"
        assert result["data"] == '{"key": "value"}'

    def test_data_raw_flag(self):
        """Test parsing with --data-raw flag."""
        cmd = 'curl --data-raw \'raw data\' https://example.com'
        result = parse_curl_command(cmd)

        assert result["data"] == "raw data"


class TestSecurityValidations:
    """Test security validations that should reject malicious commands."""

    def test_file_protocol_rejected(self, invalid_curl_commands):
        """Test that file:// protocol is rejected."""
        cmd_data = invalid_curl_commands["file_protocol"]

        with pytest.raises(ValueError) as exc_info:
            parse_curl_command(cmd_data["command"])

        assert cmd_data["error_contains"] in str(exc_info.value)

    def test_ftp_protocol_rejected(self, invalid_curl_commands):
        """Test that ftp:// protocol is rejected."""
        cmd_data = invalid_curl_commands["ftp_protocol"]

        with pytest.raises(ValueError) as exc_info:
            parse_curl_command(cmd_data["command"])

        assert cmd_data["error_contains"] in str(exc_info.value)

    def test_shell_semicolon_rejected(self, invalid_curl_commands):
        """Test that semicolon (command chaining) is rejected."""
        cmd_data = invalid_curl_commands["shell_semicolon"]

        with pytest.raises(ValueError) as exc_info:
            parse_curl_command(cmd_data["command"])

        assert cmd_data["error_contains"] in str(exc_info.value)

    def test_shell_pipe_rejected(self, invalid_curl_commands):
        """Test that pipe character is rejected."""
        cmd_data = invalid_curl_commands["shell_pipe"]

        with pytest.raises(ValueError) as exc_info:
            parse_curl_command(cmd_data["command"])

        assert cmd_data["error_contains"] in str(exc_info.value)

    def test_shell_ampersand_rejected(self, invalid_curl_commands):
        """Test that ampersand (background execution) is rejected."""
        cmd_data = invalid_curl_commands["shell_ampersand"]

        with pytest.raises(ValueError) as exc_info:
            parse_curl_command(cmd_data["command"])

        assert cmd_data["error_contains"] in str(exc_info.value)

    def test_shell_backticks_rejected(self, invalid_curl_commands):
        """Test that backticks (command substitution) are rejected."""
        cmd_data = invalid_curl_commands["shell_backticks"]

        with pytest.raises(ValueError) as exc_info:
            parse_curl_command(cmd_data["command"])

        assert cmd_data["error_contains"] in str(exc_info.value)

    def test_shell_dollar_rejected(self, invalid_curl_commands):
        """Test that $() (command substitution) is rejected."""
        cmd_data = invalid_curl_commands["shell_dollar"]

        with pytest.raises(ValueError) as exc_info:
            parse_curl_command(cmd_data["command"])

        assert cmd_data["error_contains"] in str(exc_info.value)

    def test_all_dangerous_chars_rejected(self):
        """Test that all dangerous shell metacharacters are rejected."""
        dangerous_chars = [';', '&', '|', '`', '$', '(', ')']

        for char in dangerous_chars:
            cmd = f"curl https://example.com{char}"
            with pytest.raises(ValueError) as exc_info:
                parse_curl_command(cmd)
            assert "unsafe shell characters" in str(exc_info.value)


class TestEdgeCases:
    """Test edge cases and error conditions."""

    def test_missing_curl_prefix(self, invalid_curl_commands):
        """Test that non-curl commands are rejected."""
        cmd_data = invalid_curl_commands["missing_curl_prefix"]

        with pytest.raises(ValueError) as exc_info:
            parse_curl_command(cmd_data["command"])

        assert cmd_data["error_contains"] in str(exc_info.value)

    def test_no_url_provided(self, invalid_curl_commands):
        """Test that command without URL is rejected."""
        cmd_data = invalid_curl_commands["no_url"]

        with pytest.raises(ValueError) as exc_info:
            parse_curl_command(cmd_data["command"])

        assert cmd_data["error_contains"] in str(exc_info.value)

    def test_command_too_long(self, invalid_curl_commands):
        """Test that very long commands are rejected."""
        cmd_data = invalid_curl_commands["too_long"]

        with pytest.raises(ValueError) as exc_info:
            parse_curl_command(cmd_data["command"])

        assert cmd_data["error_contains"] in str(exc_info.value)

    def test_empty_string(self):
        """Test that empty string is rejected."""
        with pytest.raises(ValueError) as exc_info:
            parse_curl_command("")

        assert "must start with 'curl'" in str(exc_info.value)

    def test_just_curl(self):
        """Test that just 'curl' without arguments is rejected."""
        with pytest.raises(ValueError) as exc_info:
            parse_curl_command("curl")

        assert "No URL found" in str(exc_info.value)

    def test_malformed_quotes(self):
        """Test handling of malformed quotes."""
        cmd = 'curl https://example.com -H "Content-Type: application/json'

        with pytest.raises(ValueError) as exc_info:
            parse_curl_command(cmd)

        assert "Invalid command syntax" in str(exc_info.value)

    def test_url_with_query_params(self):
        """Test parsing URL with query parameters."""
        cmd = "curl https://api.example.com/users?page=1&limit=10"
        result = parse_curl_command(cmd)

        assert result["url"] == "https://api.example.com/users?page=1&limit=10"

    def test_url_with_port(self):
        """Test parsing URL with custom port."""
        cmd = "curl https://example.com:8080/api"
        result = parse_curl_command(cmd)

        assert result["url"] == "https://example.com:8080/api"

    def test_multiple_headers(self):
        """Test parsing multiple header flags."""
        cmd = 'curl -H "Accept: application/json" -H "User-Agent: test" -H "X-Custom: value" https://example.com'
        result = parse_curl_command(cmd)

        assert len(result["headers"]) == 3
        assert result["headers"]["Accept"] == "application/json"
        assert result["headers"]["User-Agent"] == "test"
        assert result["headers"]["X-Custom"] == "value"

    def test_header_without_colon(self):
        """Test that header without colon is handled gracefully."""
        cmd = 'curl -H "InvalidHeader" https://example.com'
        result = parse_curl_command(cmd)

        # Should parse but header should not be added
        assert result["url"] == "https://example.com"

    def test_whitespace_in_url(self):
        """Test that URL is trimmed of whitespace."""
        cmd = "curl  https://example.com  "
        result = parse_curl_command(cmd)

        assert result["url"] == "https://example.com"


class TestHTTPMethods:
    """Test parsing various HTTP methods."""

    @pytest.mark.parametrize("method", [
        "GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"
    ])
    def test_http_method(self, method):
        """Test parsing various HTTP methods."""
        cmd = f"curl -X {method} https://example.com"
        result = parse_curl_command(cmd)

        assert result["method"] == method
        assert result["url"] == "https://example.com"

    def test_lowercase_method(self):
        """Test that lowercase method is converted to uppercase."""
        cmd = "curl -X post https://example.com"
        result = parse_curl_command(cmd)

        assert result["method"] == "POST"

    def test_mixed_case_method(self):
        """Test that mixed case method is converted to uppercase."""
        cmd = "curl -X PaTcH https://example.com"
        result = parse_curl_command(cmd)

        assert result["method"] == "PATCH"
