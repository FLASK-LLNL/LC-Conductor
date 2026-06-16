###############################################################################
## Copyright 2025-2026 Lawrence Livermore National Security, LLC.
## See the top-level LICENSE file for details.
##
## SPDX-License-Identifier: Apache-2.0
###############################################################################

"""
Configuration resolution for LC-Conductor orchestrator settings.

This module provides priority-based resolution of orchestrator configuration:
1. FLASK_ORCHESTRATOR_* environment variables (highest priority)
2. Backend-specific environment variables (via ChARGe helpers)
3. Hardcoded defaults (lowest priority)
"""

import os
from typing import Optional, Dict, Any
from loguru import logger

# Import ChARGe helper functions
from charge.clients.openai_base import (
    get_api_key_for_backend,
    get_base_url_for_backend,
    get_default_model_for_backend,
)


def resolve_backend(requested: Optional[str] = None, default: str = "livai") -> str:
    """
    Resolve the backend to use.

    Priority:
    1. CLI requested backend
    2. FLASK_ORCHESTRATOR_BACKEND environment variable
    3. Provided default

    Args:
        requested: Optional requested backend from CLI
        default: Default backend if not specified

    Returns:
        Backend name
    """
    backend = requested if requested else os.getenv("FLASK_ORCHESTRATOR_BACKEND")

    if backend:
        logger.debug(f"Using backend from FLASK_ORCHESTRATOR_BACKEND: {backend}")
        return backend

    logger.debug(f"Using default backend: {default}")
    return default


def resolve_model(
    requested: Optional[str] = None,
    backend: Optional[str] = None,
    default: Optional[str] = None,
) -> str:
    """
    Resolve the model to use for a given backend.

    Priority:
    1. CLI requested model
    2. FLASK_ORCHESTRATOR_MODEL environment variable
    3. Provided default
    4. Backend default from ChARGe (get_default_model_for_backend)

    Args:
        requested: Optional CLI requested model
        backend: Optional Backend name
        default: Optional default model

    Returns:
        Model name
    """
    model = requested if requested else os.getenv("FLASK_ORCHESTRATOR_MODEL")
    if model:
        logger.debug(f"Using model requested or FLASK_ORCHESTRATOR_MODEL: {model}")
        return model

    if default:
        logger.debug(f"Using provided default model: {default}")
        return default

    model = get_default_model_for_backend(backend)
    logger.debug(f"Using backend default model: {model}")
    return model


def resolve_api_key(
    backend: str,
) -> tuple[Optional[str], bool]:
    """
    Resolve the API key for a given backend.

    Priority:
    1. FLASK_ORCHESTRATOR_API_KEY environment variable
    2. Backend-specific environment variable (via get_api_key_for_backend)

    Args:
        backend: Backend name

    Returns:
        Tuple of (api_key, is_service_key)
        - api_key: The API key or None
        - is_service_key: True if this is a service/environment key (should not be exposed)
    """
    # Check FLASK_ORCHESTRATOR_API_KEY first
    api_key = os.getenv("FLASK_ORCHESTRATOR_API_KEY")
    if api_key:
        logger.debug("Using API key from FLASK_ORCHESTRATOR_API_KEY (service key)")
        return api_key, True  # This is a service key

    # Fall back to backend-specific environment variable
    api_key = get_api_key_for_backend(backend)
    if api_key:
        logger.debug(
            f"Using API key from backend-specific environment variable (service key)"
        )
        return api_key, True  # This is also a service key

    logger.debug("No API key found in environment")
    return None, False


def resolve_base_url(
    backend: str,
) -> Optional[str]:
    """
    Resolve the base URL for a given backend.

    Priority:
    1. FLASK_ORCHESTRATOR_URL environment variable
    2. Backend-specific environment variable (via get_base_url_for_backend)
    3. None (use default for backend)

    Args:
        backend: Backend name

    Returns:
        Base URL or None
    """
    # Check FLASK_ORCHESTRATOR_URL first
    base_url = os.getenv("FLASK_ORCHESTRATOR_URL")
    if base_url:
        logger.debug(f"Using base URL from FLASK_ORCHESTRATOR_URL: {base_url}")
        return base_url

    # Fall back to backend-specific environment variable
    base_url = get_base_url_for_backend(backend)
    if base_url:
        logger.debug(
            f"Using base URL from backend-specific environment variable: {base_url}"
        )
        return base_url

    logger.debug("No custom base URL configured")
    return None


# Add a requested backend and model in addition to the default.
def resolve_orchestrator_config(
    requested_backend: Optional[str] = None,
    requested_model: Optional[str] = None,
    default_backend: str = "livai",
    default_model: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Resolve complete orchestrator configuration with priority-based resolution.

    This function provides a single interface for resolving all orchestrator
    configuration parameters using the priority system:
    1. User / system requested Backend-specific variables (CLI)
    2. FLASK_ORCHESTRATOR_* environment variables
    3. Backend-specific environment variables (via ChARGe helpers)
    4. Provided defaults or backend defaults

    Args:
        requested_backend: Optional Requested backend from CLI
        requested_model: Optional Requested model from CLI
        default_backend: Default backend if not specified
        default_model: Optional default model

    Returns:
        Dictionary with configuration:
        {
            'backend': str,
            'model': str,
            'baseUrl': str or '',
            'hasServiceApiKey': bool,  # True if API key from environment
        }

        Note: Does NOT include actual API key value for security reasons.
              Backend code should call resolve_api_key() separately to get
              the actual key value when needed.

    Example:
        >>> config = resolve_orchestrator_config('livai', 'gpt-5.4')
        >>> print(config)
        {
            'backend': 'livai',
            'model': 'gpt-5.4',
            'baseUrl': 'https://livai.example.com/v1',
            'hasServiceApiKey': True
        }
    """
    backend = resolve_backend(default_backend)
    model = resolve_model(default_model, backend)
    base_url = resolve_base_url(backend)
    api_key, is_service_key = resolve_api_key(backend)

    config = {
        "backend": backend,
        "model": model,
        "baseUrl": base_url or "",
        "hasServiceApiKey": is_service_key,
    }

    logger.info(
        f"Resolved orchestrator config: backend={backend}, model={model}, "
        f"baseUrl={base_url or '(default)'}, hasServiceApiKey={is_service_key}"
    )

    return config


def get_api_key_for_orchestrator(backend: str) -> Optional[str]:
    """
    Get the actual API key value for backend operations.

    This is a separate function from resolve_orchestrator_config() because
    the API key should NOT be sent to the frontend for security reasons.
    Backend code should call this function when it needs the actual key.

    Args:
        backend: Backend name

    Returns:
        API key or None
    """
    api_key, _ = resolve_api_key(backend)
    return api_key
