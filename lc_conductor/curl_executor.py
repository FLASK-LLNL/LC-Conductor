###############################################################################
## Copyright 2025-2026 Lawrence Livermore National Security, LLC.
## See the top-level LICENSE file for details.
##
## SPDX-License-Identifier: Apache-2.0
###############################################################################

import time
import requests
from typing import Dict, Any
from loguru import logger
from lc_conductor.curl_parser import parse_curl_command


async def execute_curl_command(curl_command: str, client_info: str) -> Dict[str, Any]:
    """
    Execute curl command using requests library.

    Args:
        curl_command: The curl command string
        client_info: Client identification for logging

    Returns:
        {
            'success': bool,
            'status_code': int,
            'headers': dict,
            'body': str,
            'error': str,
            'execution_time_ms': float,
            'timestamp': str
        }
    """
    from datetime import datetime

    logger.info(f"Curl execution from {client_info}: {curl_command[:100]}...")

    start_time = time.time()
    timestamp = datetime.utcnow().isoformat() + 'Z'

    try:
        # Parse command
        parsed = parse_curl_command(curl_command)

        # Execute with requests (NOT subprocess)
        response = requests.request(
            method=parsed['method'],
            url=parsed['url'],
            headers=parsed['headers'],
            data=parsed['data'],
            timeout=parsed['timeout'],
            allow_redirects=True
        )

        execution_time = (time.time() - start_time) * 1000  # ms

        return {
            'success': True,
            'status_code': response.status_code,
            'headers': dict(response.headers),
            'body': response.text,
            'execution_time_ms': execution_time,
            'timestamp': timestamp
        }

    except requests.exceptions.Timeout:
        return {
            'success': False,
            'error': f"Request timed out after 30 seconds",
            'execution_time_ms': (time.time() - start_time) * 1000,
            'timestamp': timestamp
        }
    except requests.exceptions.ConnectionError as e:
        return {
            'success': False,
            'error': f"Connection failed: {str(e)}",
            'execution_time_ms': (time.time() - start_time) * 1000,
            'timestamp': timestamp
        }
    except ValueError as e:
        # Parser validation error
        return {
            'success': False,
            'error': f"Invalid command: {str(e)}",
            'execution_time_ms': (time.time() - start_time) * 1000,
            'timestamp': timestamp
        }
    except Exception as e:
        logger.error(f"Curl execution error: {e}")
        return {
            'success': False,
            'error': f"Execution failed: {str(e)}",
            'execution_time_ms': (time.time() - start_time) * 1000,
            'timestamp': timestamp
        }


async def execute_curl_endpoint_handler(request, curl_command: str) -> Dict[str, Any]:
    """
    Handler for the /execute-curl endpoint.

    This function extracts client info from the request and executes the curl command.

    Args:
        request: FastAPI Request object
        curl_command: The curl command string

    Returns:
        Dict with execution results suitable for API response
    """
    from lc_conductor.tool_registration import get_client_info
    from datetime import datetime

    client_info = get_client_info(request)

    try:
        result = await execute_curl_command(curl_command, client_info)
        return result
    except Exception as e:
        logger.error(f"Curl execution error from {client_info}: {e}")
        return {
            'success': False,
            'error': f"Execution failed: {str(e)}",
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }
