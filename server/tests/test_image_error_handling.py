"""Tests for the user-facing image-upload error handling.

When an image reaches an Anthropic-backed model as an ``image_url``
content block (OpenAI shape) instead of an ``image`` block, the
provider returns a cryptic 400. These tests pin the behaviour that
turns that raw JSON into a clean, human-readable message.

Run with::

    python3 -m unittest server.tests.test_image_error_handling -v
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path


# Make ``anton_api.*`` importable when run from the repo root.
_THIS_DIR = Path(__file__).resolve().parent
_SERVER_DIR = _THIS_DIR.parent
if str(_SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(_SERVER_DIR))


from anton_api import conversation_manager as cm  # noqa: E402


class ImageFormatErrorDetectionTest(unittest.TestCase):
    def test_detects_anthropic_image_url_rejection(self):
        exc = Exception(
            "Input tag 'image_url' found using 'type' does not match "
            "any of the expected tags: 'image'"
        )
        self.assertTrue(cm._is_image_format_error(exc))

    def test_detects_unsupported_image_phrasing(self):
        self.assertTrue(
            cm._is_image_format_error(Exception("Unsupported image media type"))
        )

    def test_ignores_unrelated_errors(self):
        self.assertFalse(
            cm._is_image_format_error(Exception("Internal server error"))
        )
        # A tool_use 400 must NOT be misread as an image failure.
        self.assertFalse(
            cm._is_image_format_error(
                Exception("tool_use ids were found without tool_result blocks")
            )
        )


class FriendlyTurnErrorTest(unittest.TestCase):
    def test_maps_image_error_to_curated_copy(self):
        result = cm._friendly_turn_error(
            Exception("'image_url' does not match expected tags: 'image'")
        )
        self.assertIsNotNone(result)
        code, message = result
        self.assertEqual(code, "image_format")
        self.assertIn("PNG or JPEG", message)

    def test_returns_none_for_unmapped_error(self):
        self.assertIsNone(cm._friendly_turn_error(Exception("boom")))


class AntonUserErrorTest(unittest.TestCase):
    def test_carries_code_and_is_runtime_error(self):
        exc = cm.AntonUserError("friendly", code="image_format")
        self.assertEqual(str(exc), "friendly")
        self.assertEqual(exc.code, "image_format")
        # The route's broader `except AntonRuntimeError` must still catch it.
        self.assertIsInstance(exc, cm.AntonRuntimeError)


if __name__ == "__main__":
    unittest.main()
