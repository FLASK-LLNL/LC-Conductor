import asyncio
import json

import pytest
from starlette.websockets import WebSocketDisconnect

from lc_conductor.session import PersistentWebsocketWrapper, SessionTimedOut


class FakeWebSocket:
    def __init__(
        self,
        *,
        received_text: list[str] | None = None,
        disconnect_on_receive: bool = False,
        disconnect_on_send: bool = False,
    ) -> None:
        self.sent: list[dict] = []
        self.received_text = received_text or []
        self.disconnect_on_receive = disconnect_on_receive
        self.disconnect_on_send = disconnect_on_send

    async def send(self, message: dict) -> None:
        if self.disconnect_on_send:
            raise WebSocketDisconnect()
        self.sent.append(message)

    async def receive_text(self) -> str:
        if self.disconnect_on_receive:
            raise WebSocketDisconnect()
        return self.received_text.pop(0)


@pytest.mark.asyncio
async def test_send_buffers_while_disconnected_and_flushes_on_reconnect() -> None:
    wrapper = PersistentWebsocketWrapper(None, timeout_s=1.0)

    await wrapper.send_text("first")
    await wrapper.send_json({"value": 2})

    ws = FakeWebSocket()
    await wrapper.set_websocket(ws)  # type: ignore[arg-type]

    assert [message["text"] for message in ws.sent] == [
        "first",
        json.dumps({"value": 2}, separators=(",", ":"), ensure_ascii=False),
    ]
    assert all("timestamp" in message for message in ws.sent)


@pytest.mark.asyncio
async def test_receive_waits_for_reconnect_from_another_thread() -> None:
    wrapper = PersistentWebsocketWrapper(None, timeout_s=1.0)
    receive_task = asyncio.create_task(wrapper.receive_text())

    await asyncio.sleep(0)
    ws = FakeWebSocket(received_text=["reconnected"])
    await asyncio.to_thread(lambda: asyncio.run(wrapper.set_websocket(ws)))  # type: ignore[arg-type]

    assert await receive_task == "reconnected"


@pytest.mark.asyncio
async def test_receive_retries_after_websocket_disconnect() -> None:
    disconnected_ws = FakeWebSocket(disconnect_on_receive=True)
    wrapper = PersistentWebsocketWrapper(disconnected_ws, timeout_s=1.0)  # type: ignore[arg-type]
    receive_task = asyncio.create_task(wrapper.receive_text())

    await asyncio.sleep(0)
    reconnected_ws = FakeWebSocket(received_text=["next"])
    await wrapper.set_websocket(reconnected_ws)  # type: ignore[arg-type]

    assert await receive_task == "next"


@pytest.mark.asyncio
async def test_send_buffers_message_when_connected_websocket_disconnects() -> None:
    disconnected_ws = FakeWebSocket(disconnect_on_send=True)
    wrapper = PersistentWebsocketWrapper(disconnected_ws, timeout_s=1.0)  # type: ignore[arg-type]

    await wrapper.send_text("queued")

    reconnected_ws = FakeWebSocket()
    await wrapper.set_websocket(reconnected_ws)  # type: ignore[arg-type]

    assert [message["text"] for message in reconnected_ws.sent] == ["queued"]


@pytest.mark.asyncio
async def test_receive_raises_session_timed_out_after_disconnect_timeout() -> None:
    wrapper = PersistentWebsocketWrapper(None, timeout_s=0.01)

    with pytest.raises(SessionTimedOut):
        await wrapper.receive_text()

    with pytest.raises(SessionTimedOut):
        await wrapper.send_text("too late")
