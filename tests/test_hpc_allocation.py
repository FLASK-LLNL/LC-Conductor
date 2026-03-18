###############################################################################
## Copyright 2025-2026 Lawrence Livermore National Security, LLC.
## See the top-level LICENSE file for details.
##
## SPDX-License-Identifier: Apache-2.0
###############################################################################

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from lc_conductor.hpc_allocation import build_hpc_allocation_curl, execute_hpc_allocation_from_env
from lc_conductor.backend_manager import ActionManager


def test_build_hpc_allocation_curl_substitutes_all_placeholders():
    template = (
        'curl -X POST -H "Content-Type: application/json" '
        '-d "{\\"system\\": \\"{system}\\", \\"nodes\\": {nodes}, \\"time\\": \\"{time}\\", \\"bank\\": \\"{bank}\\"}" '
        "https://example.com/allocate"
    )
    cmd = build_hpc_allocation_curl(
        template, system="lassen", nodes=2, time="01:00:00", bank="mybank"
    )

    assert "{system}" not in cmd
    assert "{nodes}" not in cmd
    assert "{time}" not in cmd
    assert "{bank}" not in cmd
    assert "lassen" in cmd
    assert "2" in cmd
    assert "01:00:00" in cmd
    assert "mybank" in cmd


def test_build_hpc_allocation_curl_requires_all_placeholders():
    with pytest.raises(ValueError, match="missing placeholders"):
        build_hpc_allocation_curl(
            "curl https://example.com/allocate?system={system}",
            system="lassen",
            nodes=1,
            time="01:00:00",
            bank="mybank",
        )


@pytest.mark.asyncio
async def test_execute_hpc_allocation_from_env_missing_template(monkeypatch):
    monkeypatch.delenv("FLASK_HPC_ALLOCATION_CURL_TEMPLATE", raising=False)
    executed, result = await execute_hpc_allocation_from_env(
        system="lassen",
        nodes=1,
        time="01:00:00",
        bank="mybank",
        client_info="test-client",
    )

    assert executed is None
    assert result["success"] is False
    assert "FLASK_HPC_ALLOCATION_CURL_TEMPLATE" in result["error"]
    assert result["timestamp"].endswith("Z")


@pytest.mark.asyncio
async def test_execute_hpc_allocation_from_env_executes_curl_via_requests(
    monkeypatch, mocker, mock_successful_response
):
    template = (
        'curl -X POST -H "Content-Type: application/json" '
        '-d "{\\"system\\": \\"{system}\\", \\"nodes\\": {nodes}, \\"time\\": \\"{time}\\", \\"bank\\": \\"{bank}\\"}" '
        "https://example.com/allocate"
    )
    monkeypatch.setenv("FLASK_HPC_ALLOCATION_CURL_TEMPLATE", template)

    mock_requests = mocker.patch("lc_conductor.curl_executor.requests")
    mock_requests.request.return_value = mock_successful_response

    executed, result = await execute_hpc_allocation_from_env(
        system="lassen",
        nodes=3,
        time="02:00:00",
        bank="wci",
        client_info="test-client",
    )

    assert executed is not None
    assert result["success"] is True
    assert result["status_code"] == 200
    mock_requests.request.assert_called_once()


@pytest.mark.asyncio
async def test_action_manager_handle_allocate_hpc_resources_sends_result(mocker):
    websocket = AsyncMock()
    task_manager = SimpleNamespace(websocket=websocket)
    action_manager = ActionManager(task_manager=task_manager, experiment=mocker.Mock(), args=None, username="u")

    mocker.patch(
        "lc_conductor.backend_manager.execute_hpc_allocation_from_env",
        return_value=(
            "curl https://example.com/allocate",
            {"success": True, "status_code": 200, "headers": {}, "body": "ok", "timestamp": "tZ"},
        ),
    )

    await action_manager.handle_allocate_hpc_resources(
        {
            "type": "allocate-hpc-resources",
            "requestId": "req-1",
            "allocation": {"system": "lassen", "nodes": 1, "time": "01:00:00", "bank": "mybank"},
        }
    )

    websocket.send_json.assert_awaited()
    payload = websocket.send_json.call_args[0][0]
    assert payload["type"] == "allocate-hpc-resources-result"
    assert payload["requestId"] == "req-1"
    assert payload["allocation"]["system"] == "lassen"
    assert payload["allocation"]["nodes"] == 1
    assert payload["result"]["success"] is True

