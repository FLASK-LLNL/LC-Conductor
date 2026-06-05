###############################################################################
## Copyright 2025-2026 Lawrence Livermore National Security, LLC.
## See the top-level LICENSE file for details.
##
## SPDX-License-Identifier: Apache-2.0
###############################################################################

import sys
from fastapi import WebSocket
from loguru import logger
from typing import Optional


# Define the callback function - will send message to the websocket if it is provided
async def handle_callback_log(message):
    record = message.record
    extra = record["extra"]
    websocket = extra.get("websocket", None)
    if websocket:
        # Timestamp is already included in the GUI window
        # timestamp = record["time"].isoformat(" ", timespec='seconds')
        msg = record["message"]
        level = record["level"].name
        source = extra.get("source", None)
        source = source if isinstance(source, str) else None
        if not source:
            LEVELS = {
                "DEBUG": "Debug",
                "VERBOSE": "Verbose",
                "INFO": "Info",
                "WARN": "Warning",
                "WARNING": "Warning",
                "ERROR": "Error",
                "EXCEPTION": "Exception",
            }
            level_str = LEVELS.get(level, level)
            source = f"Logger ({level_str})"
        message_fields = {"source": source, "message": msg}
        smiles = extra.get("smiles", None)
        if isinstance(smiles, str):
            message_fields["smiles"] = smiles
        agent_key = extra.get("agentKey", None)
        if isinstance(agent_key, str):
            message_fields["agentKey"] = agent_key
        event_kind = extra.get("eventKind", None)
        if isinstance(event_kind, str):
            message_fields["eventKind"] = event_kind
        await websocket.send_json(
            {
                "type": "response",
                "message": message_fields,
            }
        )


logger.add(handle_callback_log, filter=lambda record: record["level"].name == "INFO")
logger.add(handle_callback_log, filter=lambda record: record["level"].name == "Info")
logger.add(handle_callback_log, filter=lambda record: record["level"].name == "Warning")
logger.add(handle_callback_log, filter=lambda record: record["level"].name == "Debug")
logger.add(handle_callback_log, filter=lambda record: record["level"].name == "Error")
logger.add(
    handle_callback_log, filter=lambda record: record["level"].name == "Exception"
)


# The Callback logger can hold a websocket that will allow the log message to be
# copied to the websocket as well as the logger
class CallbackLogger:
    def __init__(self, websocket: WebSocket, source: Optional[str] = None):
        self.websocket = websocket
        self.logger = logger.bind()
        self.source = source

    def _apply_msg_source(self, **kwargs):
        if self.source and (not kwargs or "source" not in kwargs):
            kwargs["source"] = self.source
        return kwargs

    async def _send(self, level: str, message: str, **kwargs):
        kwargs = self._apply_msg_source(**kwargs)
        log_kwargs = {k: v for k, v in kwargs.items() if k != "source"}
        if log_kwargs:
            logger.bind(**log_kwargs).log(level, message)
        else:
            logger.log(level, message)

        if self.websocket is None:
            return

        source = kwargs.get("source", None)
        source = source if isinstance(source, str) else f"Logger ({level.title()})"
        message_fields = {
            "source": source,
            "message": message,
        }
        smiles = kwargs.get("smiles", None)
        if isinstance(smiles, str):
            message_fields["smiles"] = smiles
        agent_key = kwargs.get("agentKey", None)
        if isinstance(agent_key, str):
            message_fields["agentKey"] = agent_key
        event_kind = kwargs.get("eventKind", None)
        if isinstance(event_kind, str):
            message_fields["eventKind"] = event_kind
        payload: dict[str, object] = {
            "type": "response",
            "message": message_fields,
        }
        await self.websocket.send_json(payload)

    async def info(self, message, **kwargs):
        await self._send("INFO", message, **kwargs)

    async def warning(self, message, **kwargs):
        await self._send("WARNING", message, **kwargs)

    async def debug(self, message, **kwargs):
        await self._send("DEBUG", message, **kwargs)

    async def error(self, message, **kwargs):
        await self._send("ERROR", message, **kwargs)

    async def exception(self, message, **kwargs):
        await self._send("ERROR", message, **kwargs)

    def unbind(self):
        self.websocket = None
        self.logger = logger.bind()
