###############################################################################
## Copyright 2025-2026 Lawrence Livermore National Security, LLC.
## See the top-level LICENSE file for details.
##
## SPDX-License-Identifier: Apache-2.0
###############################################################################

import shlex
from typing import Dict, Any
from urllib.parse import urlparse


def parse_curl_command(curl_command: str) -> Dict[str, Any]:
    """
    Parse curl command into HTTP request components.

    Security validations:
    - Only http/https protocols allowed
    - Rejects shell metacharacters
    - Maximum 10,000 character length

    Returns:
        {
            'method': str,  # GET, POST, etc.
            'url': str,
            'headers': Dict[str, str],
            'data': Optional[str],
            'timeout': float
        }
    """
    # Validate length
    if len(curl_command) > 10000:
        raise ValueError("Command too long (max 10,000 chars)")

    # Check for shell metacharacters
    dangerous_chars = [';', '&', '|', '`', '$', '(', ')']
    if any(char in curl_command for char in dangerous_chars):
        raise ValueError("Command contains unsafe shell characters")

    # Parse with shlex (safe tokenization)
    try:
        parts = shlex.split(curl_command)
    except ValueError as e:
        raise ValueError(f"Invalid command syntax: {e}")

    # First token must be 'curl'
    if not parts or parts[0] != 'curl':
        raise ValueError("Command must start with 'curl'")

    # Extract components
    method = 'GET'
    url = None
    headers = {}
    data = None

    i = 1
    while i < len(parts):
        arg = parts[i]

        if arg in ['-X', '--request']:
            i += 1
            if i < len(parts):
                method = parts[i].upper()
        elif arg in ['-H', '--header']:
            i += 1
            if i < len(parts):
                header = parts[i]
                if ':' in header:
                    key, value = header.split(':', 1)
                    headers[key.strip()] = value.strip()
        elif arg in ['-d', '--data', '--data-raw']:
            i += 1
            if i < len(parts):
                data = parts[i]
        elif not arg.startswith('-'):
            # This is likely the URL
            url = arg
        # Skip other flags we don't support

        i += 1

    if not url:
        raise ValueError("No URL found in command")

    # Validate URL
    parsed = urlparse(url)
    if parsed.scheme not in ['http', 'https']:
        raise ValueError(f"Only http/https protocols allowed, got: {parsed.scheme}")

    return {
        'method': method,
        'url': url,
        'headers': headers,
        'data': data,
        'timeout': 30.0
    }
