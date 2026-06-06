###############################################################################
## Copyright 2025-2026 Lawrence Livermore National Security, LLC.
## See the top-level LICENSE file for details.
##
## SPDX-License-Identifier: Apache-2.0
###############################################################################

from __future__ import annotations

from typing import Literal, TypeAlias

from pydantic import BaseModel, Field, field_validator

JsonObject: TypeAlias = dict[str, object]


class AgentRequest(BaseModel):
    agentKey: str

    @field_validator("agentKey")
    @classmethod
    def require_agent_key(cls, value: str) -> str:
        agent_key = value.strip()
        if not agent_key:
            raise ValueError("agentKey is required")
        return agent_key


class AgentRuntimeConfigRecord(BaseModel):
    backend: str | None = None
    model: str | None = None


class AgentInstructionSnapshotRecord(BaseModel):
    messageCount: int
    instructions: str


class AgentPendingUserMessageRecord(BaseModel):
    text: str
    afterMessageCount: int = 0
    images: list[JsonObject] | None = None


class AgentRecord(BaseModel):
    runtimeConfig: AgentRuntimeConfigRecord | None = None
    memory: str = ""
    modelInfo: JsonObject = Field(default_factory=dict)
    task: JsonObject | None = None
    instructionHistory: list[AgentInstructionSnapshotRecord] | None = None
    pendingUserMessage: AgentPendingUserMessageRecord | None = None


class ExperimentAgentRecords(BaseModel):
    agentSessions: dict[str, AgentRecord] = Field(default_factory=dict)


class AgentResponse(BaseModel):
    type: Literal["agent-response"] = "agent-response"
    agentKey: str
    agent: AgentRecord


class ListAgentsResponse(BaseModel):
    type: Literal["list-agents-response"] = "list-agents-response"
    agents: list[str]
