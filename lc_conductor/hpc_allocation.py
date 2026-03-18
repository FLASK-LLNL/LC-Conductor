###############################################################################
## Copyright 2025-2026 Lawrence Livermore National Security, LLC.
## See the top-level LICENSE file for details.
##
## SPDX-License-Identifier: Apache-2.0
###############################################################################

from __future__ import annotations

from datetime import datetime
import os
from typing import Any, Dict, Optional, Tuple

from lc_conductor.curl_executor import execute_curl_command
from lc_conductor.curl_parser import parse_curl_command


def build_hpc_allocation_curl(
    template: str, *, system: str, nodes: int, time: str, bank: str
) -> str:
    required_placeholders = ["{system}", "{nodes}", "{time}", "{bank}"]
    missing = [p for p in required_placeholders if p not in template]
    if missing:
        raise ValueError(
            "HPC allocation curl template missing placeholders: "
            + ", ".join(missing)
            + ". Expected {system} {nodes} {time} {bank}."
        )

    curl_command = template
    curl_command = curl_command.replace("{system}", system)
    curl_command = curl_command.replace("{nodes}", str(nodes))
    curl_command = curl_command.replace("{time}", time)
    curl_command = curl_command.replace("{bank}", bank)
    return curl_command


async def execute_hpc_allocation_from_env(
    *,
    system: str,
    nodes: int,
    time: str,
    bank: str,
    client_info: str,
) -> Tuple[Optional[str], Dict[str, Any]]:
    """
    Build and execute an HPC allocation request using an env-provided curl template.

    Env var:
      - FLASK_HPC_ALLOCATION_CURL_TEMPLATE: a curl command string containing
        placeholders {system} {nodes} {time} {bank}.
    """
    template = os.getenv("FLASK_HPC_ALLOCATION_CURL_TEMPLATE", "").strip()
    timestamp = datetime.utcnow().isoformat() + "Z"

    if not template:
        return None, {
            "success": False,
            "error": "FLASK_HPC_ALLOCATION_CURL_TEMPLATE is not set",
            "timestamp": timestamp,
        }

    try:
        curl_command = build_hpc_allocation_curl(
            template, system=system, nodes=nodes, time=time, bank=bank
        )
        # Validate using existing curl parser validations (no metacharacters, http/https only, etc.)
        parse_curl_command(curl_command)
    except ValueError as e:
        return None, {
            "success": False,
            "error": f"Invalid allocation curl template or values: {e}",
            "timestamp": timestamp,
        }

    result = await execute_curl_command(curl_command, client_info)
    return curl_command, result

