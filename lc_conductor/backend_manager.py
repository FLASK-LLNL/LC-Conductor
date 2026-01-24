from typing import Literal, Optional, Tuple
from fastapi import WebSocket
import asyncio
import os
from loguru import logger
from lc_conductor.callback_logger import CallbackLogger
from concurrent.futures import ProcessPoolExecutor
from charge.experiments.AutoGenExperiment import AutoGenExperiment
from charge.clients.autogen_utils import chargeConnectionError
#from charge.tasks.Task import Task
from functools import partial
from lc_conductor.tool_registration import (
    ToolList,
    list_server_urls,
    list_server_tools,
)

# Mapping from backend name to human-readable labels. Mirrored from the frontend
BACKEND_LABELS = {
    "openai": "OpenAI",
    "livai": "LivAI",
    "llamame": "LLamaMe",
    "alcf": "ALCF Sophia",
    "gemini": "Google Gemini",
    "ollama": "Ollama",
    "vllm": "vLLM",
    "huggingface": "HuggingFace Local",
    "custom": "Custom URL",
}


class TaskManager:
    """Manages background tasks and processes state for a websocket connection."""

    def __init__(self, websocket: WebSocket, max_workers: int = 4):
        self.websocket = websocket
        self.current_task: Optional[asyncio.Task] = None
        self.clogger = CallbackLogger(websocket, source="backend_manager")
        self.max_workers = max_workers
        self.executor = ProcessPoolExecutor(max_workers=max_workers)
        self.available_tools: Optional[list[str]] = None

    def _attach_done_callback(self, task: asyncio.Task) -> None:
        """Attach a done-callback to a background task so exceptions are observed.

        The callback forwards useful error metadata to the websocket and logs
        the exception type/module so class-identity mismatches (multiple
        installations of `charge`) can be diagnosed.
        """
        if task is None:
            return
        task.add_done_callback(lambda t: asyncio.create_task(self._handle_task_done(t)))

    async def _handle_task_done(self, task: asyncio.Task) -> None:
        try:
            exc = task.exception()
        except asyncio.CancelledError:
            logger.info("Background task was cancelled")
            return

        if exc is None:
            return

        # Log the exception details
        msg = f"Background task failed with exception: {type(exc).__name__}: {exc}"
        logger.error(msg)
        await self.websocket.send_json(
            {
                "type": "response",
                "message": {
                    "source": "system",
                    "message": msg,
                },
            }
        )

        if type(exc) == chargeConnectionError:
            # logger.error(f"Charge connection error in background task: {exc}")
            await self.clogger.info(
                f"Unsupported model was selected.  \n Server encountered error: {exc}"
            )
        else:
            # Log other exceptions for debugging
            logger.exception(
                f"Unexpected error in background task: {type(exc).__name__}: {exc}"
            )

        # Send a stopped message with error details to the websocket so the UI can react
        try:
            await self.websocket.send_json({"type": "complete"})
        except Exception as send_error:
            logger.exception(f"Failed to send task error to websocket: {send_error}")

    async def run_task(self, coro) -> None:
        await self.cancel_current_task()
        try:
            self.current_task = asyncio.create_task(coro)
            self._attach_done_callback(self.current_task)
            await self.current_task  # Await it to catch exceptions properly
        except asyncio.CancelledError:
            logger.info("Task was cancelled")
            raise
        except Exception as e:
            logger.error(f"Task failed: {e}")
            await self.websocket.send_json({"type": "complete"})
            # Optionally re-raise or handle as needed

    async def cancel_current_task(self) -> None:
        if self.current_task and not self.current_task.done():
            logger.info("Cancelling current task...")
            self.current_task.cancel()
            try:
                await self.current_task
            except asyncio.CancelledError:
                logger.info("Current task cancelled successfully.")
        await self.restart_executor()

    async def restart_executor(self) -> None:
        """Shutdown and recreate the process pool executor."""
        self.executor.shutdown(wait=False, cancel_futures=True)
        self.executor = ProcessPoolExecutor(max_workers=self.max_workers)

    async def close(self) -> None:
        await self.cancel_current_task()
        self.executor.shutdown(wait=False, cancel_futures=True)
        self.clogger.unbind()


class ActionManager:
    """Handles action state for a websocket connection."""

    def __init__(
        self,
        task_manager: TaskManager,
        experiment: AutoGenExperiment,
        args,
        username: str,
    ):
        self.task_manager = task_manager
        self.experiment = experiment
        self.args = args
        self.username = username
        self.molecule_name_format: Literal["brand", "iupac", "formula", "smiles"] = (
            "brand"
        )
        self.websocket = task_manager.websocket

    async def handle_save_state(self, *args, **kwargs) -> None:
        """Handle save state action."""
        logger.info("Save state action received")

        experiment_context = await self.experiment.save_state()
        await self.websocket.send_json(
            {"type": "save-context-response", "experimentContext": experiment_context}
        )

    async def handle_load_state(self, data, *args, **kwargs) -> None:
        """Handle load state action."""
        logger.info("Load state action received")
        experiment_context = data.get("experimentContext")
        if not experiment_context:
            logger.error("No experiment context provided for loading state")
            return
        await self.experiment.load_state(experiment_context)

    async def _send_processing_message(
        self, message: str, source: str | None = None, **kwargs
    ) -> None:
        """Send a processing message to the client."""
        await self.websocket.send_json(
            {
                "type": "response",
                "message": {
                    "source": source or "System",
                    "message": message,
                },
                **kwargs,
            }
        )

    async def handle_list_tools(self, *args, **kwargs) -> None:
        tools = []
        server_list = list_server_urls()
        for server in server_list:
            tool_list = await list_server_tools([server])
            tool_names = [name for name, _ in tool_list]
            tools.append(ToolList(server=server, names=tool_names))
        await self.websocket.send_json(
            {
                "type": "available-tools-response",
                "tools": [tool.json() for tool in tools] if tools else [],
            }
        )

    async def report_orchestrator_config(self) -> Tuple[str, str, str]:
        agent_pool = self.experiment.agent_pool
        # Access the raw config
        raw_config = agent_pool.model_client._raw_config
        # Access specific fields
        base_url = raw_config.get("base_url")
        model = raw_config.get("model")
        api_key = raw_config.get("api_key")
        if agent_pool.backend in ["livai", "livchat", "llamame", "alcf"]:
            useCustomUrl = True
        else:
            useCustomUrl = False
        await self.websocket.send_json(
            {
                "type": "server-update-orchestrator-settings",
                "orchestratorSettings": {
                    "backend": agent_pool.backend,
                    "backendLabel": BACKEND_LABELS.get(
                        agent_pool.backend, agent_pool.backend
                    ),
                    "useCustomUrl": useCustomUrl,
                    "customUrl": base_url if base_url else "",
                    "model": model,
                    "useCustomModel": False,
                    "apiKey": "",
                },
            }
        )
        return agent_pool.backend, model, base_url

    async def handle_orchestrator_settings_update(self, data: dict) -> None:
        from charge.experiments.AutoGenExperiment import AutoGenExperiment
        from charge.clients.autogen import AutoGenPool

        if "moleculeName" in data:
            self.molecule_name_format = data["moleculeName"]

        backend = data["backend"]
        model = data["model"]
        base_url = data["customUrl"] if data["customUrl"] else None
        api_key = data["apiKey"] if data["apiKey"] else None
        await self.handle_reset()

        # Default to server defaults
        if backend == os.getenv("FLASK_ORCHESTRATOR_BACKEND", None):
            if not api_key:
                api_key = os.getenv("FLASK_ORCHESTRATOR_API_KEY", None)
            if not base_url:
                base_url = os.getenv("FLASK_ORCHESTRATOR_URL", None)

        try:
            logger.info(f"Experiment is reset with model {model} and backend {backend}")
            autogen_pool = AutoGenPool(
                model=model, backend=backend, api_key=api_key, base_url=base_url
            )
            # Set up an experiment class for current endpoint
            self.experiment = AutoGenExperiment(task=None, agent_pool=autogen_pool)

            await self.websocket.send_json(
                {
                    "type": "response",
                    "message": {
                        "source": "System",
                        "message": f"Experiment is reset with model {model} and backend {backend}",
                    },
                }
            )
        except ValueError as e:
            logger.error(
                f"Orchestrator Profile Error: Unable to restart experiment: {e}"
            )
            backend, model, base_url = await self.report_orchestrator_config()
            await self.websocket.send_json(
                {
                    "type": "response",
                    "message": {
                        "source": "System",
                        "message": f"Orchestrator Profile Error: Unable to restart experiment: {e}. Experiment is still using backend {backend} with model {model} at {base_url}",
                    },
                }
            )

    async def handle_reset(self, *args, **kwargs) -> None:
        """Handle reset action."""
        await self.task_manager.cancel_current_task()
        self.experiment.reset()
        self.retro_synth_context = None

    async def handle_stop(self, *args, **kwargs) -> None:
        """Handle stop action."""
        logger.info("Stop action received")
        if self.task_manager.current_task:
            if not self.task_manager.current_task.done():
                logger.info("Stopping current task as per user request.")
                await self.task_manager.cancel_current_task()

                # Send confirmation to frontend
                try:
                    await self.websocket.send_json({"type": "stopped"})
                    logger.info("Sent 'stopped' confirmation to frontend")
                except Exception as e:
                    logger.error(f"Failed to send stopped confirmation: {e}")
            else:
                logger.info(f"Task already done: {self.task_manager.current_task}")
                await self.websocket.send_json({"type": "stopped"})
        else:
            logger.info(
                f"No active task to stop. Task done: {self.task_manager.current_task.done() if self.task_manager.current_task else 'N/A'}"
            )
            try:
                await self.websocket.send_json({"type": "stopped"})
            except Exception as e:
                logger.error(f"Failed to send stopped confirmation: {e}")

    async def handle_select_tools_for_task(self, data: dict) -> None:
        """Handle select-tools-for-task action."""
        logger.info("Select tools for task")
        logger.info(f"Data: {data}")
        available_tools = []
        for server in data["enabledTools"]["selectedTools"]:
            available_tools.append(server["tool_server"]["server"])
        self.task_manager.available_tools = available_tools

    async def handle_get_username(self, _: dict) -> None:
        await self.websocket.send_json(
            {
                "type": "get-username-response",
                "username": self.username,
            }
        )
