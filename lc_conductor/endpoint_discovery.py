###############################################################################
## Copyright 2025-2026 Lawrence Livermore National Security, LLC.
## See the top-level LICENSE file for details.
##
## SPDX-License-Identifier: Apache-2.0
###############################################################################

"""
Endpoint discovery functionality for LC-Conductor.

This module provides functions to discover available models from OpenAI-compatible
API endpoints.
"""

from typing import List, Optional, Dict, Any
from loguru import logger
from pydantic import BaseModel
import os

try:
    from openai import OpenAI

    HAS_OPENAI_SDK = True
except ImportError:
    HAS_OPENAI_SDK = False


def discover_available_models(
    base_url: str,
    api_key: Optional[str] = None,
    timeout: int = 10,
) -> List[Dict[str, Any]]:
    """
    Discover available models from an OpenAI API-compatible endpoint.

    Args:
        base_url: Base URL of the API endpoint (e.g., "https://api.openai.com/v1")
        api_key: API key for authentication (optional)
        timeout: Request timeout in seconds

    Returns:
        List of model dictionaries from the API response

    Raises:
        Exception: If the request fails

    Example:
        >>> models = discover_available_models(
        ...     "https://api.openai.com/v1",
        ...     api_key="sk-..."
        ... )
        >>> print([m['id'] for m in models])
        ['gpt-4', 'gpt-3.5-turbo', ...]
    """
    if not HAS_OPENAI_SDK:
        logger.error("OpenAI SDK not available - cannot discover models")
        raise ImportError("openai package is required for model discovery")

    try:
        # Create OpenAI client with custom base URL
        client = OpenAI(
            base_url=base_url,
            api_key=api_key or "dummy-key",  # Some endpoints don't require auth
            timeout=timeout,
        )

        # Use the SDK's models.list() method
        models_page = client.models.list()

        # Convert Model objects to dictionaries
        models = [
            {
                "id": model.id,
                "object": model.object,
                "created": model.created,
                "owned_by": model.owned_by,
            }
            for model in models_page.data
        ]

        return models

    except Exception as e:
        logger.error(f"Failed to discover models from {base_url}: {e}")
        raise


def get_model_ids(
    base_url: str,
    api_key: Optional[str] = None,
    timeout: int = 10,
) -> List[str]:
    """
    Get list of model IDs from an OpenAI API-compatible endpoint.

    Args:
        base_url: Base URL of the API endpoint
        api_key: API key for authentication (optional)
        timeout: Request timeout in seconds

    Returns:
        List of model ID strings

    Raises:
        requests.exceptions.RequestException: If the request fails

    Example:
        >>> model_ids = get_model_ids("https://api.openai.com/v1", api_key="sk-...")
        >>> print(model_ids)
        ['gpt-4', 'gpt-3.5-turbo', ...]
    """
    models = discover_available_models(base_url, api_key, timeout)
    return [model.get("id", "") for model in models if "id" in model]


def discover_models_for_backend(
    backend: str,
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
    timeout: int = 10,
) -> List[str]:
    """
    Discover available models for a given backend.

    Args:
        backend: Backend name (e.g., 'openai', 'livai', 'vllm')
        base_url: Optional base URL override
        api_key: Optional API key
        timeout: Request timeout in seconds

    Returns:
        List of model IDs, or empty list if discovery fails

    Example:
        >>> models = discover_models_for_backend('openai', api_key='sk-...')
        >>> print(models)
        ['gpt-4', 'gpt-3.5-turbo', ...]
    """
    # Import here to avoid circular dependencies
    from charge.clients.openai_base import (
        get_base_url_for_backend,
        get_api_key_for_backend,
    )

    # Get base URL if not provided
    if not base_url:
        base_url = get_base_url_for_backend(backend)
        if not base_url:
            # Use default URLs for known backends
            default_urls = {
                "openai": "https://api.openai.com/v1",
                "gemini": "https://generativelanguage.googleapis.com/v1",
            }
            base_url = default_urls.get(backend)

    if not base_url:
        logger.warning(f"No base URL available for backend: {backend}")
        return []

    # BVE do we send ind the API key here only when the user has provided it.  Otherwise it should be discovered from the environment.
    # Get API key if not provided
    if not api_key:
        api_key = get_api_key_for_backend(backend)

    try:
        logger.info(f"Discovering models from {backend} at {base_url}")
        models = get_model_ids(base_url, api_key, timeout)
        logger.info(f"Found {len(models)} models for {backend}")
        return models
    except Exception as e:
        logger.warning(f"Failed to discover models for {backend}: {e}")
        return []


def get_default_models_for_backend(backend: str) -> List[str]:
    """
    Get hardcoded default models for a backend as fallback.

    Args:
        backend: Backend name

    Returns:
        List of default model IDs
    """
    defaults = {
        "openai": [
            "gpt-5.4",
            "gpt-5.2",
            "gpt-5.1",
            "gpt-5",
            "gpt-5-mini",
            "gpt-5-nano",
        ],
        "livai": [
            "gpt-5.5",
            "gpt-5.4",
            "gpt-5.4-mini",
            "gpt-5.4-nano",
            "gpt-5.2",
            "gpt-5.1",
            "gpt-5",
            "gpt-5-mini",
            "gpt-5-nano",
            "claude-sonnet-4.5",
            "claude-sonnet-3.7",
        ],
        "llamame": ["openai/gpt-oss-120b", "meta-llama/Llama-3.3-70B-Instruct"],
        "alcf": [
            "openai/gpt-oss-120b",
            "openai/gpt-oss-20b",
            "meta-llama/Llama-4-Scout-17B-16E-Instruct",
        ],
        "gemini": [
            "gemini-2.0-flash-exp",
            "gemini-1.5-pro",
            "gemini-1.5-flash",
            "gemini-1.0-pro",
        ],
        "ollama": ["gpt-oss:latest", "gpt-oss-120b", "gpt-oss-20b"],
        "vllm": ["gpt-oss-120b", "gpt-oss-20b"],
    }
    return defaults.get(backend, [])


def discover_models_with_fallback(
    backend: str,
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
    timeout: int = 10,
) -> List[str]:
    """
    Discover models from endpoint, falling back to defaults if discovery fails.

    Args:
        backend: Backend name
        base_url: Optional base URL override
        api_key: Optional API key
        timeout: Request timeout in seconds

    Returns:
        List of model IDs (discovered or default)
    """
    discovered = discover_models_for_backend(backend, base_url, api_key, timeout)

    if discovered:
        return discovered

    # Fall back to defaults
    logger.info(f"Using default models for {backend}")
    return get_default_models_for_backend(backend)


# Pydantic models for API endpoint
class DiscoverModelsRequest(BaseModel):
    """Request model for discover models endpoint."""

    backend: str
    base_url: Optional[str] = None
    api_key: Optional[str] = None


class DiscoverModelsResponse(BaseModel):
    """Response model for discover models endpoint."""

    backend: str
    models: List[str]
    source: str  # "discovered" or "default"


def validate_initial_model(
    backend: str,
    model: Optional[str] = None,
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
    timeout: int = 5,
) -> str:
    """
    Validate and correct an initial model configuration.

    This function discovers available models for a backend and validates that
    the provided model exists. If not, it returns the first available model.

    Args:
        backend: Backend name (e.g., 'openai', 'livai')
        model: Optional model to validate
        base_url: Optional base URL
        api_key: Optional API key
        timeout: Discovery timeout in seconds

    Returns:
        A valid model name (either the validated input or first available model)

    Example:
        >>> validated_model = validate_initial_model('openai', 'gpt-999', api_key='sk-...')
        >>> # Returns 'gpt-4' if 'gpt-999' doesn't exist but 'gpt-4' does
    """
    try:
        available_models = discover_models_with_fallback(
            backend=backend,
            base_url=base_url,
            api_key=api_key,
            timeout=timeout,
        )

        if not available_models:
            logger.warning(
                f"No models available for backend '{backend}', returning configured model '{model}'"
            )
            return model or ""

        # BVE provide a way to promote a "normal model name" to a service model name
        # If model is provided and valid, return it
        if model and model in available_models:
            logger.info(f"Model '{model}' validated for backend '{backend}'")
            return model

        # If model is not in available models, use first available
        if model and model not in available_models:
            logger.warning(
                f"Configured model '{model}' not found in available models for backend '{backend}'. "
                f"Using '{available_models[0]}' instead."
            )
            return available_models[0]

        # If no model provided, use first available
        if not model:
            logger.info(
                f"No model configured for backend '{backend}', using first available: '{available_models[0]}'"
            )
            return available_models[0]

        return model or ""

    except Exception as e:
        logger.error(f"Failed to validate initial model for backend '{backend}': {e}")
        # Return the configured model or empty string on error
        return model or ""


async def discover_models_endpoint(
    request: DiscoverModelsRequest,
) -> DiscoverModelsResponse:
    """
    FastAPI endpoint for discovering available models for a backend.

    This endpoint attempts to discover models from the backend's API endpoint
    and falls back to hardcoded defaults if discovery fails.

    Args:
        request: DiscoverModelsRequest with backend, optional base_url, and optional api_key

    Returns:
        DiscoverModelsResponse with list of models and source indicator

    Example:
        POST /api/discover-models
        {
            "backend": "openai",
            "base_url": "https://api.openai.com/v1",
            "api_key": "sk-..."
        }

        Response:
        {
            "backend": "openai",
            "models": ["gpt-4", "gpt-3.5-turbo", ...],
            "source": "discovered"
        }
    """
    # Try to discover models
    discovered_models = discover_models_for_backend(
        backend=request.backend,
        base_url=request.base_url,
        api_key=request.api_key,
        timeout=10,
    )

    if discovered_models:
        logger.info(
            f"Successfully discovered {len(discovered_models)} models for {request.backend}"
        )
        return DiscoverModelsResponse(
            backend=request.backend,
            models=discovered_models,
            source="discovered",
        )

    # Fall back to defaults
    default_models = get_default_models_for_backend(request.backend)
    logger.info(f"Using {len(default_models)} default models for {request.backend}")
    return DiscoverModelsResponse(
        backend=request.backend,
        models=default_models,
        source="default",
    )
