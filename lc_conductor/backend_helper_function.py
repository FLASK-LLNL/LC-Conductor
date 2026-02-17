import asyncio
from typing import Any, Dict, Optional, Literal, Tuple
from dataclasses import dataclass, asdict


@dataclass
class RunSettings:
    prompt_debugging: bool

    def __init__(self, promptDebugging: bool = False):
        self.prompt_debugging = promptDebugging


async def loop_executor(executor, func, *args, **kwargs):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, func, *args, **kwargs)
