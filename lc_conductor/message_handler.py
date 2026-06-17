###############################################################################
## Copyright 2025-2026 Lawrence Livermore National Security, LLC.
## See the top-level LICENSE file for details.
##
## SPDX-License-Identifier: Apache-2.0
###############################################################################
"""
Syntactic sugar to allow ActionManagers to register their handlers with ease.

For example:

class MyActionManager(ActionManager):
    @handles("action")
    def handle_action(self, message: str):
        print("Action handled!", message)
"""


def handles(action_name: str):
    """
    Registers an action name with a method that will handle it.

    :param action_name: The name as it will be received from the client.
    """

    def decorator(fn):
        fn.__handles__ = action_name
        return fn

    return decorator


class HandlerMeta(type):
    """
    Metaclass supporting
    """

    def __new__(mcls, name, bases, namespace, **kwargs):
        cls = super().__new__(mcls, name, bases, namespace, **kwargs)

        handlers = {}

        # Inherit parent handlers without sharing the dict.
        for base in reversed(cls.__mro__[1:]):
            handlers.update(getattr(base, "_handlers", {}))

        # Register handlers declared directly on this class.
        for attr_name, value in namespace.items():
            action_name = getattr(value, "__handles__", None)
            if action_name is not None:
                handlers[action_name] = attr_name

        cls._handlers = handlers
        return cls


class HandlerBase(metaclass=HandlerMeta):
    """
    Base class for action managers to use for the ``handles`` syntactic sugar.
    """

    def dispatch(self, action_name: str, *args, **kwargs):
        try:
            method_name = self._handlers[action_name]
        except KeyError:
            raise ValueError(f"No handler for {action_name!r}") from None

        method = getattr(self, method_name)  # bound method
        return method(*args, **kwargs)
