###############################################################################
## Copyright 2025-2026 Lawrence Livermore National Security, LLC.
## See the top-level LICENSE file for details.
##
## SPDX-License-Identifier: Apache-2.0
###############################################################################
"""
User session management functionality and classes.
User sessions are kept alive beyond a web session (i.e., websocket).
"""

import asyncio
import json
import threading
import time
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Iterable, TYPE_CHECKING

from starlette.types import Message
from starlette.websockets import WebSocket, WebSocketDisconnect

from loguru import logger

if TYPE_CHECKING:
    from lc_conductor.backend_manager import ActionManager

# Asyncio has no portable way to await a threading.Lock directly. Send/receive
# serialization uses a short async poll so cancellation cannot strand a lock
# acquisition in a worker thread.
_LOCK_POLL_INTERVAL_S = 0.01


class SessionTimedOut(Exception):
    """
    Specialized exception class for when a persistent websocket session times
    out.
    """

    pass


class PersistentWebsocketWrapper:
    """
    A class that maintains the Starlette/FastAPI ``WebSocket`` interface but can
    survive disconnection by storing all unsent messages in-memory and bursting
    them out upon reconnection.
    """

    def __init__(self, ws: WebSocket | None, timeout_s: float = 3600.0) -> None:
        """
        Creates a persistent ``WebSocket`` wrapper.

        :param ws: An existing, connected Starlette WebSocket object, or None
                   if disconnected.
        :param timeout_s: Timeout for the persistent session, in seconds.
        """
        # All websocket pointer, queue, and timeout state is protected by this
        # condition. It is a threading primitive because set_websocket() may be
        # called from another OS thread while async receive calls are waiting.
        self._state_condition = threading.Condition(threading.RLock())

        # Starlette WebSocket objects are not safe for concurrent sends or
        # receives. Keep the directions separate: a send and receive may run at
        # the same time, but only one send or one receive can be active.
        self._send_lock = threading.Lock()
        self._receive_lock = threading.Lock()

        self._internal_websocket: WebSocket | None = ws

        # Messages produced while disconnected are retained here until the next
        # websocket attaches. The queue is flushed in FIFO order under the send
        # lock so newly-produced messages cannot overtake older queued ones.
        self._message_queue: list[Message] = []
        self._timeout = timeout_s

        # The timeout starts when the wrapper first becomes disconnected. It is
        # reset only by a successful reconnect, so repeated receive/send retries
        # share one persistent-session grace period.
        self._disconnected_at: float | None = time.monotonic() if ws is None else None
        self._timed_out = False

    @property
    def websocket(self) -> WebSocket | None:
        with self._state_condition:
            return self._internal_websocket

    async def set_websocket(self, ws: WebSocket | None) -> None:
        """
        Attach a new websocket, or mark the persistent session disconnected.

        Reconnection wakes blocked receive calls and flushes queued outbound
        messages before later sends can use the new websocket.
        """
        async with self._serialized_send_access():
            queued_messages: list[Message] = []

            with self._state_condition:
                self._raise_if_timed_out_locked()
                self._internal_websocket = ws
                if ws is None:
                    self._mark_disconnected_locked()
                else:
                    self._disconnected_at = None
                    queued_messages = self._message_queue
                    self._message_queue = []
                self._state_condition.notify_all()

            if ws is not None and queued_messages:
                await self._flush_messages(ws, queued_messages)

    async def _on_reconnect(self):
        """
        Handles (re)connection to a new WebSocket instance, sending all messages
        accumulated when the websocket was disconnected.
        """
        async with self._serialized_send_access():
            with self._state_condition:
                ws = self._internal_websocket
                self._raise_if_timed_out_locked()
                assert ws is not None
                queued_messages = self._message_queue
                self._message_queue = []

            await self._flush_messages(ws, queued_messages)

    async def receive(self) -> Message:
        return await self._receive_with_timeout("receive")

    async def send(self, message: Message) -> None:
        async with self._serialized_send_access():
            with self._state_condition:
                self._raise_if_timed_out_locked()
                ws = self._internal_websocket
                if ws is None:
                    # Disconnected sessions keep outbound traffic in memory until
                    # either a reconnect flushes it or the session times out.
                    self._message_queue.append(message)
                    return

            try:
                await ws.send(message)
            except WebSocketDisconnect:
                with self._state_condition:
                    # Preserve the message that discovered the disconnect; it
                    # was not accepted by the websocket and should be replayed.
                    if self._internal_websocket is ws:
                        self._internal_websocket = None
                    self._mark_disconnected_locked()
                    self._message_queue.append(message)
                    self._state_condition.notify_all()

    async def accept(
        self,
        subprotocol: str | None = None,
        headers: Iterable[tuple[bytes, bytes]] | None = None,
    ) -> None:
        raise NotImplementedError(
            "This method should be called on a websocket directly"
        )

    async def send_text(self, data: str) -> None:
        await self.send({"type": "websocket.send", "text": data})

    async def send_bytes(self, data: bytes) -> None:
        await self.send({"type": "websocket.send", "bytes": data})

    async def send_json(self, data: Any, mode: str = "text") -> None:
        if mode not in {"text", "binary"}:
            raise RuntimeError('The "mode" argument should be "text" or "binary".')

        if "timestamp" not in data:
            # Add server-local timestamp, in case a message is sent at a later point
            data["timestamp"] = time.time()

        text = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
        if mode == "text":
            await self.send({"type": "websocket.send", "text": text})
        else:
            await self.send({"type": "websocket.send", "bytes": text.encode("utf-8")})

    async def close(self, code: int = 1000, reason: str | None = None) -> None:
        await self.send(
            {"type": "websocket.close", "code": code, "reason": reason or ""}
        )

    async def _receive_with_timeout(self, method_name: str, *args, **kwargs) -> Any:
        """
        Implements a receive call with a timeout if the underlying websocket is
        not connected.
        """
        async with self._serialized_lock_access(self._receive_lock):
            while True:
                with self._state_condition:
                    self._raise_if_timed_out_locked()
                    ws = self._internal_websocket

                if ws is not None:
                    method = getattr(ws, method_name)
                    try:
                        result = await method(*args, **kwargs)
                        return result
                    except WebSocketDisconnect:
                        with self._state_condition:
                            # Convert transport disconnects into persistent
                            # session disconnects. The receive call then waits
                            # for a replacement websocket until timeout.
                            if self._internal_websocket is ws:
                                self._internal_websocket = None
                            self._mark_disconnected_locked()
                            self._state_condition.notify_all()
                        continue

                await self._wait_for_websocket_or_raise()

    @asynccontextmanager
    async def _serialized_send_access(self):
        async with self._serialized_lock_access(self._send_lock):
            yield

    @asynccontextmanager
    async def _serialized_lock_access(self, lock: threading.Lock):
        """
        Await a threading lock without blocking the event loop.

        This wrapper is intentionally cancellation-safe: unlike
        ``asyncio.to_thread(lock.acquire)``, a cancelled waiter cannot acquire
        the lock later and leave it permanently held.
        """
        while not lock.acquire(blocking=False):
            await asyncio.sleep(_LOCK_POLL_INTERVAL_S)
        try:
            yield
        finally:
            lock.release()

    async def _flush_messages(self, ws: WebSocket, messages: list[Message]) -> None:
        """
        Send a snapshot of queued messages to a newly attached websocket.

        If the reconnect fails mid-flush, the unsent suffix is returned to the
        front of the queue so it remains ordered before messages queued later.
        """
        for index, message in enumerate(messages):
            try:
                await ws.send(message)
            except WebSocketDisconnect:
                with self._state_condition:
                    if self._internal_websocket is ws:
                        self._internal_websocket = None
                    self._mark_disconnected_locked()
                    # Preserve FIFO order across a failed reconnect attempt.
                    self._message_queue = messages[index:] + self._message_queue
                    self._state_condition.notify_all()
                return

    async def _wait_for_websocket_or_raise(self) -> None:
        await asyncio.to_thread(self._wait_for_websocket_or_raise_sync)

    def _wait_for_websocket_or_raise_sync(self) -> None:
        """
        Block a worker thread until reconnect or persistent-session timeout.

        The condition is notified by set_websocket() and by send/receive paths
        that notice a transport disconnect.
        """
        with self._state_condition:
            while self._internal_websocket is None:
                self._raise_if_timed_out_locked()
                assert self._disconnected_at is not None
                remaining_s = self._timeout - (time.monotonic() - self._disconnected_at)
                if remaining_s <= 0:
                    self._timed_out = True
                    self._state_condition.notify_all()
                    raise SessionTimedOut("Persistent websocket session timed out")
                self._state_condition.wait(timeout=remaining_s)

            self._raise_if_timed_out_locked()

    def _mark_disconnected_locked(self) -> None:
        """
        Start the timeout window if this is the first observed disconnect.

        Must be called with _state_condition held.
        """
        if self._disconnected_at is None:
            self._disconnected_at = time.monotonic()

    def _raise_if_timed_out_locked(self) -> None:
        """
        Raise and permanently mark the session timed out when the window elapses.

        Must be called with _state_condition held.
        """
        if self._timed_out:
            raise SessionTimedOut("Persistent websocket session timed out")
        if self._internal_websocket is not None or self._disconnected_at is None:
            return
        if time.monotonic() - self._disconnected_at >= self._timeout:
            self._timed_out = True
            self._state_condition.notify_all()
            raise SessionTimedOut("Persistent websocket session timed out")

    async def receive_text(self) -> str:
        return await self._receive_with_timeout("receive_text")

    async def receive_bytes(self) -> bytes:
        return await self._receive_with_timeout("receive_bytes")

    async def receive_json(self, mode: str = "text") -> Any:
        return await self._receive_with_timeout("receive_json")

    async def iter_text(self) -> AsyncIterator[str]:
        try:
            while True:
                yield await self.receive_text()
        except WebSocketDisconnect:
            pass

    async def iter_bytes(self) -> AsyncIterator[bytes]:
        try:
            while True:
                yield await self.receive_bytes()
        except WebSocketDisconnect:
            pass

    async def iter_json(self) -> AsyncIterator[Any]:
        try:
            while True:
                yield await self.receive_json()
        except WebSocketDisconnect:
            pass


class UserSession:
    """
    Represents a user session (akin to a live websocket connection that might
    disconnect and reconnect at any time). Stores all the necessary data for
    this session (e.g., experiment context).
    """

    def __init__(
        self,
        username: str,
        session_id: str,
        websocket: WebSocket,
        action_manager: "ActionManager",
    ) -> None:
        """
        Initializes a user session.

        :param username: The user name.
        :param session_id: A unique ID for this session.
        :param websocket: A Starlette WebSocket to use for message management
        :param task_manager: An LC Conductor Task Manager (managing async tasks)
        :param action_manager: An Action Manager (managing server responses)
        """
        self.username: str = username
        self.session_id: str = session_id
        self.created_at: float = time.monotonic()

        # Fields necessary for running the code
        self.websocket = PersistentWebsocketWrapper(websocket)
        self.action_manager = action_manager

        # Session management
        UserSessionManager.add_session(username, self)

    @property
    def is_active(self):
        return self.websocket.websocket is not None

    async def handle_action(self, action: str, data: dict[str, Any]):
        raise NotImplementedError("Abstract method, implement in subclass")

    async def _event_loop_thread(self):
        """
        Event loop runner
        """
        try:
            while True:
                try:
                    data: dict[str, Any] = await self.websocket.receive_json()
                    action: str | None = data.get("action")
                    if not action:
                        await self.action_manager.task_manager.clogger.error(
                            f"Malformed user message: {data}"
                        )
                        continue
                    await self.handle_action(action, data)
                except SessionTimedOut:
                    # Specialized exception breaks loop
                    break
                except WebSocketDisconnect:
                    # Websocket disconnection does nothing
                    continue
                except Exception as ex:
                    # Other exceptions are reported to the user
                    await self.action_manager.task_manager.clogger.exception(ex)
                    continue
        except SessionTimedOut:
            await self.websocket.set_websocket(None)
            UserSessionManager.remove_session(self.username, self.session_id)

        # Tear down action manager
        await self.action_manager.cleanup()

    async def event_loop(self):
        """
        Runs an event loop listening for messages.

        :note: The event loop runs on a separate thread.
        """
        await asyncio.to_thread(self._event_loop_thread)


class UserSessionManager:
    """
    A singleton object that manages mapping users to their active sessions
    for reconstitution upon reconnection. Also manages the session threadpool
    resource.
    """

    _GUARD = threading.RLock()
    USER_TO_SESSIONS: dict[str, list[UserSession]] = {}

    @classmethod
    def get_latest_inactive_session(cls, user: str) -> UserSession | None:
        """
        Returns the latest-opened inactive session for the given username, or
        None if there are none.
        """
        cls.cleanup_sessions()
        with cls._GUARD:
            sessions = cls.USER_TO_SESSIONS.get(user)
        if not sessions:  # Captures both "is None" and "len(sessions) == 0"
            return None
        for session in reversed(sessions):
            if not session.is_active:
                return session
        return None  # All sessions are active

    @classmethod
    def add_session(cls, user: str, session: UserSession):
        with cls._GUARD:
            if user not in cls.USER_TO_SESSIONS:
                cls.USER_TO_SESSIONS[user] = [session]
            else:
                cls.USER_TO_SESSIONS[user].append(session)

    @classmethod
    def remove_session(cls, user: str, session_id: str):
        with cls._GUARD:
            sessions = cls.USER_TO_SESSIONS.get(user)
            if sessions is None:
                logger.warning(f"User {user} does not exist in active sessions")
                return
            cls.USER_TO_SESSIONS[user] = [
                s for s in sessions if s.session_id != session_id
            ]
        cls.cleanup_sessions()

    @classmethod
    def cleanup_sessions(cls):
        """
        Garbage-collects all inactive users.
        """
        with cls._GUARD:
            for user, sessions in list(cls.USER_TO_SESSIONS.items()):
                if not sessions:
                    del cls.USER_TO_SESSIONS[user]
