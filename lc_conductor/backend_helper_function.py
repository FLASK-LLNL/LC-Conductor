import asyncio
from pydantic.dataclasses import dataclass
from pydantic import Field


@dataclass
class RunSettings:
    prompt_debugging: bool = Field(alias="promptDebugging", default=False)


async def loop_executor(executor, func, *args, **kwargs):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, func, *args, **kwargs)
